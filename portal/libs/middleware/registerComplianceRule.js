const config = require('../config-loader.js')
const { complianceBreadcrumbs } = require('../../utils/shared');
const { latestOnly, security, accountLookup } = require("../views/queries");

const defaultGroupableField = "team";

const registerComplianceRule = (rule, router) => router.get(`/rule/${rule.id}`, renderRule(rule));

const groupableFields = {
    account_id: {
        name: "Account ID",
        dataSelector: "accountDetails.account_id",
        valueToLongName: s => s,
        valueToName: s => s,
    },
    team: {
        name: "Team",
        dataSelector: "accountDetails.team",
        valueToLongName: s => s,
        valueToName: s => s,
    },
    tenant: {
        name: "Tenant",
        dataSelector: "accountDetails.tenant",
        valueToLongName: s => `[${s.id}] ${s.name}`,
        valueToName: s => s.id,
    },
};

const queryParamsToString = queryParams => Object.keys(queryParams).length === 0 ?
    "" :
    `?${Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .reduce((a, b) => `${a}&${b}`)}`;

const linksToHtml = (links, row, field, groupKey, groupValue) => {
    const link = links?.find(link => link.field === field)
    if (!link) return row[field];
    const queryParams = [[groupKey, groupValue], ...link.forward.map(fwd => [fwd, row[fwd]])].reduce((obj, q) => { obj[q[0]] = q[1]; return obj; }, {})
    const href = `/compliance/view/${link.view}${queryParamsToString(queryParams)}`;
    return `<a class="govuk-link" href="${href}">${row[field]}</a>`;
}

const renderRule = ({id, name, description, view, pipeline, header, links}) => async (req, res) => {
    const groupby = req.query.groupby ?? defaultGroupableField;
    const groupableField = groupableFields[groupby];
    const groups = config.get("auth.admin_emails", "not_set") === req.oidc?.user?.email ? ["*"] : req.oidc?.user?.groups ?? ["*"];
    const tables = (await req.unsafeDb.collection(`compliance_view_${view}`)
        .aggregate([
            ...latestOnly,
            ...accountLookup,
            ...security(groups),
            {$match: { _is_empty_marker: { $exists: false }}},
            ...pipeline(groupableField.dataSelector),
        ])
        .toArray())
        .map(({ _id, rows }) => ({
            name: groupableField.valueToName(_id),
            longName: groupableField.valueToLongName(_id),
            rows: rows.map(row => header.map(field => ({
                html: linksToHtml(links, row, field, groupableField.name, groupableField.valueToName(_id))
            })))
        }));
    console.log(require('util').inspect(tables, {depth: 10}));
    res.render('policies/compliance_rule.njk', {
        breadcrumbs: [...complianceBreadcrumbs, { text: id, href: req.path }],
        policy_title: `[${id}] ${name}`,
        policy_description: description,
        groupByItems: Object.entries(groupableFields).map(([key, field]) => ({
            value: key,
            text: field.name,
            selected: key === groupby,
        })),
        header: header.map(text => ({ text })),
        tables,
        section: "compliance"
    });
};

module.exports = registerComplianceRule;
