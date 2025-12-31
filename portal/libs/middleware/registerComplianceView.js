const config = require('../config-loader.js')
const { latestOnly, security, accountLookup } = require("../views/queries");
const { complianceBreadcrumbs } = require('../../utils/shared');

const defaultPageSize = 10;
const defaultFilterableFields = [
    { name: "Account ID", idSelector: "accountDetails.account_id" },
    { name: "Team", idSelector: "accountDetails.team" },
    { name: "Tenant", idSelector: "accountDetails.tenant.id" },
];

const registerComplianceView = async (view, router, allRules, allViews) => router.get(`/view/${view.id}`, renderView(view, allRules, allViews));

/**
 * @param {Array<{name: string, idSelector: string}>} filterableFields
 * @param {string[]} searchableFields
 *
 * @returns {(page: number, pageSize: number, filters: Array<[string, string]>, search: string) => any[]}
 */
const createViewPipeline = (filterableFields, searchableFields) => (page, pageSize, filters, search) => [
    ...(filters.length === 0 ? [] : [{$match: {$or: [{ _is_empty_marker: true }, {$and: filters.map(([key, value]) => ({[key]: {$eq: value}}))}]}}]),
    ...(!search ? [] : [{$match: {$or: [{ _is_empty_marker: true }, ...searchableFields.map((name) =>
        ({[name]: {$regex: search, $options: "is"}})
    )]}}]), // Note from AI: use a text index instead as it is better performance > 100k records.
    {
        $facet: {
            metadata: [{ $match: { _is_empty_marker: { $exists: false } } }, { $count: "total_count" }],
            resources: [{ $match: { _is_empty_marker: { $exists: false } } },{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
            uniqueFields: [
                { $match: { _is_empty_marker: { $exists: false } } },
                { $group: {
                    _id: null,
                    ...filterableFields
                        .filter(f => !f.hide)
                        .map(({name, idSelector}) => [name, {$addToSet: `$${idSelector}`}])
                        .reduce((o,f) => { o[f[0]] = f[1]; return o; }, {})
                }}
            ],
        },
    }
];

const queryParamsToString = queryParams => Object.keys(queryParams).length === 0 ?
    "" :
    `?${Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .reduce((a, b) => `${a}&${b}`)}`;

const displayPagination = (page, pages, path, currentQueryParams) => {
    const pageHref = (page) => `${path}${queryParamsToString({...currentQueryParams, page })}`;
    const pageItem = (p) => ({ number: p, href: pageHref(p), current: p === page });
    return ({
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
    });
};

/**
 *  @param {{
 *      id: string,
 *      name: string,
 *      idField: string,
 *      prominentFields: string[],
 *      filterableFields: Array<{name: string, idSelector: string}>,
 *      searchableFields: string[],
 *      detailsFields: Array<{ name: string, type: "string" | "object" }>,
 *  }} view
 */
const renderView = ({ collection, pipeline, id, name, idField, prominentFields, filterableFields, searchableFields, detailsFields }, allRules, allViews) => {
    const allFilterableFields = defaultFilterableFields
        .concat(filterableFields)
        .concat([{ name: "Id", idSelector: idField, hide: true }]);
    const viewPipeline = createViewPipeline(allFilterableFields, searchableFields);
    const filtersFromQueryParams = queryParams => allFilterableFields
        .filter(({name}) => queryParams[name] && queryParams[name] !== " ")
        .map(({name, idSelector}) => [idSelector, decodeURIComponent(queryParams[name])]);
    const displayFilterableFields = (queryParams, uniqueFields) => allFilterableFields
        .filter(({hide}) => !hide)
        .map(({name}) => ({
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
        }));

    return async (req, res) => {
        const url = req.originalUrl.split("?")[0];
        const queryParams = req.query || {};
        const page = Number.parseInt(queryParams.page ?? "1") ?? 1;
        const search = queryParams?.search !== "" ? queryParams.search : null;
        const filters = filtersFromQueryParams(queryParams);
        const isFiltered = filters.length > 0 || (search !== null && search !== "");

        const groups = config.get("auth.admin_emails", "not_set") === req.oidc?.user?.email ? ["*"] : req.oidc?.user?.groups ?? ["*"];
        const fullViewPipeline = [
            ...latestOnly,
            ...accountLookup,
            ...security(groups),
            ...viewPipeline(page, defaultPageSize, filters, search),
        ];
        const { metadata, resources, uniqueFields } = (await req.unsafeDb.collection(`compliance_view_${id}`).aggregate(fullViewPipeline).toArray())[0];

        const resourceCount = metadata[0]?.total_count ?? 0;
        const pages = Math.ceil(resourceCount / defaultPageSize);

        res.render('policies/compliance_view.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: name, href: url } ],
            policy_title: name,
            queryParams,
            filterableFields: displayFilterableFields(queryParams, uniqueFields),
            prominentFields,
            detailsFields,
            idField,
            resources,
            showPagination: pages > 1,
            pagination: displayPagination(page, pages, url, queryParams),
            section: "compliance",
            url,
            isFiltered,
            activeFilterCount: filters.length + (search ? 1 : 0),
            sideMenu: ({
                rules: allRules.map(r => ({ id: r.id, name: r.name })),
                views: allViews.map(v => ({ id: v.id, name: v.name }))
            })
        });
    }
}

module.exports = registerComplianceView;
