const { complianceBreadcrumbs } = require('../../utils/shared');
const { toDetailsAgg, toTableAgg } = require("./queries");

const render = (query) => async (req, res) => {
    switch(query.viewOptions.type) {
        case "table":
            return renderTable(req, res, query);
        case "details_list":
            return renderDetails(req, res, query);
        default:
            throw new Error(`Invalid View Option on query: ${query.viewOptions.type}`);
    }
}

const pageSize = 10;

// Todo: These can all be one object.
const defaultFilterableFields = [
    { name: "Account ID", selector: "accountDetails.account_id" },
    { name: "Team", selector: "accountDetails.team" },
    { name: "Tenant", selector: "accountDetails.tenant.id" },
];
const groupByToSelector = {
    account_id: "accountDetails.account_id",
    team: "accountDetails.team",
    tenant: "accountDetails.tenant",
};
const groupByToName = {
    account_id: s => s,
    team: s => s,
    tenant: s => `[${s.id}] ${s.name}`,
};
const groupByToShortname = {
    account_id: s => s,
    team: s => s,
    tenant: s => s.id,
};
const groupByToFilterableField = {
    account_id: "Account ID",
    team: "Team",
    tenant: "Tenant",
};

const capitalise = s => s[0].toUpperCase() + s.slice(1);

const queryParamsToString = (queryParams) =>{
    return `${Object.entries(queryParams).length === 0 ? "" : "?"}${Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .reduce((a, b) => `${a}&${b}`)}`;
}

const linksToHtml = (links, row, field, groupKey, groupValue) => {
    const link = links?.find(link => link.field === field)
    if (!link) return row[field];
    const queryParams = [[groupKey, groupValue], ...link.forward.map(fwd => [fwd, row[fwd]])].reduce((obj, q) => { obj[q[0]] = q[1]; return obj; }, {})
    const href = `${link.path}${queryParamsToString(queryParams)}`;
    return `<a class="govuk-link" href="${href}">${row[field]}</a>`;
}

async function renderTable(req, res, query) {
    const groupBy = req.query.groupby || "team";
    const {header, links, title, description, firstCellIsHeader, url} = query.viewOptions;
    const agg = toTableAgg(query.agg);
    const tables = (await req.collection(query.collection)
        .aggregate(agg(groupByToSelector[groupBy]))
        .toArray())
        .map(({ _id, rows }) => ({
            name: groupByToName[groupBy](_id),
            shortname: groupByToShortname[groupBy](_id),
            rows: rows.map(row => header.map(field => ({
                html: linksToHtml(links, row, field, groupByToFilterableField[groupBy], groupByToShortname[groupBy](_id))
            })))
        }));
    res.render('policies/table.njk', {
        breadcrumbs: [...complianceBreadcrumbs, { text: title, href: url }],
        policy_title: title,
        policy_description: description,
        groupByItems: Object.keys(groupByToSelector).map(key => ({
            value: key,
            text: groupByToFilterableField[key],
            selected: groupBy === key
        })),
        header: header.map(text => ({ text })),
        firstCellIsHeader,
        tables,
        section: "compliance"
    });
}

async function renderDetails(req, res, query) {
    const { id_field, prominent_fields, searchable_fields, details_fields, title, description, url } = query.viewOptions;
    const filterable_fields = [...query.viewOptions.filterable_fields, ...defaultFilterableFields];
    const agg = toDetailsAgg(query.agg, filterable_fields, searchable_fields);

    const queryParams = req.query || {};
    const page = Number.parseInt(queryParams.page) || 1;
    const search = queryParams?.search !== "" ? queryParams.search : null;

    const filters = filterable_fields
        .filter(({name}) => queryParams[name] && queryParams[name] !== " ")
        .map(({name, selector}) => [selector, decodeURIComponent(queryParams[name])]);

    console.log(require('util').inspect(agg(page, pageSize, filters, search), {depth: 20}));
    const { metadata, resources, uniqueFields } = (await req.collection(query.collection).aggregate(agg(page, pageSize, filters, search)).toArray())[0];

    const resourceCount = metadata[0]?.total_count || 0;
    const pages = Math.floor((resourceCount / pageSize) + 0.9999);
    const pageHref = (page) => `${url}${queryParamsToString({...queryParams, page })}`
    const pageItem = (p) => ({ number: p, href: pageHref(p), current: p === page })

    res.render('policies/details.njk', {
        breadcrumbs: [...complianceBreadcrumbs, { text: title, href: url } ],
        policy_title: title,
        policy_description: description,
        queryParams,
        filterable_fields: filterable_fields.map(({name}) => ({
            id: encodeURIComponent(name),
            name: name,
            items: [
                {
                    value: " ",
                    text: "All",
                    selected: queryParams[name] === undefined || queryParams[name] === " " || undefined,
                },
                ...(uniqueFields.length === 0 ? [] : uniqueFields[0][name].sort().map(value => ({
                    value: encodeURIComponent(value),
                    text: value,
                    selected: queryParams[name] === encodeURIComponent(value) || undefined
                })))
            ],
        })),
        prominent_fields,
        details_fields,
        id_field,
        resources,
        showPagination: pages > 1,
        pagination: {
            previous: {
              href: pageHref(Math.max(page - 1, 1))
            },
            next: {
              href: pageHref(Math.min(page + 1, pages))
            },
            items: [
                // Slot 1
                // If more than one page display 1.
                // Otherwise don't display.
                (pages > 1) ? pageItem(1) : null, // No items required if no pages.
                // Slot 2
                // If more than 7 pages. Display ellipsis if 2 cannot be displayed.
                // If not display 2 if page exists.
                // Otherwise don't display.
                (pages > 7) && (page > 4) ? { ellipsis: true } : (pages >= 2) ? pageItem(2) : null,
                // Slot 3
                // Display the minimum of page - 1 or pages - 4 and maximum of 3.
                // Otherwise don't display.
                (pages >= 3) ? pageItem(Math.max(Math.min(page - 1, pages - 4), 3)) : null,
                // Slot 4
                // Display the minimum of page or pages - 3 and maximum of 4.
                // Otherwise don't display
                (pages >= 4) ? pageItem(Math.max(Math.min(page, pages - 3), 4)) : null,
                // Slot 5
                // Display the minimum of page + 1 or pages - 2 and maximum of 5.
                // Otherwise don't display
                // If more than 7 pages. Display page + 1.
                // If not display 5 if page exists.
                // Otherwise don't display.
                (pages >= 5) ? pageItem(Math.max(Math.min(page + 1, pages - 2), 5)) : null,
                // Slot 6
                // If more than 7 pages. Display ellipsis if pages - 1 cannot be displayed. 1 .. 3 16 17 .. 20
                // If not display 6 if page exists.
                // Otherwise don't display.
                (pages > 7) && (page <= pages - 4) ? { ellipsis: true } : (pages >= 7) ? pageItem(pages - 1) : (pages === 6) ? pageItem(6) : null,
                // Slot 7
                // If more than or equal to 7 pages. Display the last page.
                // Otherwise don't display.
                (pages >= 7) ? pageItem(pages) : null,
            ].filter(i => i !== null),
        },
        section: "compliance",
        url
    });
}

module.exports = { render }
