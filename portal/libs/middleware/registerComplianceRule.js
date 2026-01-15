const config = require('../config-loader.js')
const { complianceBreadcrumbs } = require('../../utils/shared');
const { latestOnly, security, accountLookup } = require("../views/queries");

const defaultGroupableField = "team";
const defaultViewOptsRule = "non_compliant_only"; // non_compliant_only or all
const defaultViewOptsRuleSummary = "all"; // non_compliant_only or all

const registerComplianceRule = (rule, router, allRules, allViews) => router.get(`/rule/${rule.id}`, renderRule(rule, allRules, allViews));

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

const rowsToDetails = (rows, threshold) => {
    let compliantCount = 0;
    let count = 0;
    for (const row of rows) {
        if (row.Compliant) {
            compliantCount += row.Count;
        }
        count += (row.Count ?? 0);
    }
    const percentage = count === 0 ? 100 : (Math.floor((compliantCount / count) * 100));
    const status = percentage >= (threshold ?? 100) ? "Compliant" : "Non Compliant";
    const colorVar = status === "Compliant" ? "--app-primary-green" : "--app-tertiary-red"
    return { compliantCount, count, status, colorVar };
}

const renderRule = ({id, name, description, view, pipeline, header, links, threshold}, allRules, allViews) => async (req, res) => {
    const groupby = req.query.groupby ?? defaultGroupableField;
    const viewOpts = req.query.viewopts ?? defaultViewOptsRule;
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
            details: rowsToDetails(rows, threshold),
            rows: rows
                .filter(row => viewOpts === "all" ? true : viewOpts === "non_compliant_only" ? !row.Compliant : false)
                .map(row => header.map(field =>
                    linksToHtml(links, row, field, groupableField.name, groupableField.valueToName(_id))
                ))
        }));
    res.render('policies/compliance_rule.njk', {
        breadcrumbs: [...complianceBreadcrumbs, { text: id, href: req.path }],
        policy_title: `[${id}] ${name}`,
        policy_description: description,
        groupByItems: Object.entries(groupableFields).map(([key, field]) => ({
            value: key,
            text: field.name,
            selected: key === groupby,
        })),
        viewOpts,
        header: header,
        tables,
        section: "compliance",
        sideMenu: ({
            rules: allRules.map(r => ({ id: r.id, name: r.name })),
            views: allViews.map(v => ({ id: v.id, name: v.name }))
        })
    });
};

const registerComplianceRuleSummary = (rules, views) => async (req, res) => {
    const groupby = req.query.groupby ?? defaultGroupableField;
    const viewOpts = req.query.viewopts ?? defaultViewOptsRuleSummary;
    const groupableField = groupableFields[groupby];
    const groups = config.get("auth.admin_emails", "not_set") === req.oidc?.user?.email ? ["*"] : req.oidc?.user?.groups ?? ["*"];

    const allRuleResults = await Promise.all(rules.map(async (rule) => {
        const results = await req.unsafeDb.collection(`compliance_view_${rule.view}`)
            .aggregate([
                ...latestOnly,
                ...accountLookup,
                ...security(groups),
                {$match: { _is_empty_marker: { $exists: false }}},
                ...rule.pipeline(groupableField.dataSelector),
            ])
            .toArray();
        return { rule, results };
    }));

    const groupedSummary = {};

    allRuleResults.forEach(({ rule, results }) => {
        results.forEach(({ _id, rows }) => {
            const groupName = groupableField.valueToName(_id);
            const groupLongName = groupableField.valueToLongName(_id);

            if (!groupedSummary[groupName]) {
                groupedSummary[groupName] = {
                    name: groupLongName,
                    id: groupName,
                    ruleStatuses: []
                };
            }

            const stats = rowsToDetails(rows, rule.threshold);

            if (viewOpts === "all" || stats.status === "Non Compliant") {
                groupedSummary[groupName].ruleStatuses.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    ...stats,
                    threshold: rule.threshold ?? 100,
                    percentage: stats.count === 0 ? 100 : Math.floor((stats.compliantCount / stats.count) * 100)
                });
            }
        });
    });

    const tables = Object.values(groupedSummary).sort((a, b) => a.name.localeCompare(b.name));

    const menu_items = rules.map(rule => ({
        text: `[${rule.id}] ${rule.name}`,
        href: `/compliance/rule/${rule.id}`
    }));

    res.render('policies/compliance_rule_summary.njk', {
        breadcrumbs: [...complianceBreadcrumbs],
        policy_title: `Compliance Summary by ${groupableField.name}`,
        policy_description: "Detailed compliance breakdown across all organizational units.",
        menu_items,
        currentPath: req.path,
        groupByItems: Object.entries(groupableFields).map(([key, field]) => ({
            value: key,
            text: field.name,
            selected: key === groupby,
        })),
        viewOpts,
        groupby,
        tables,
        section: "compliance",
        sideMenu: ({
            rules: rules.map(r => ({ id: r.id, name: r.name })),
            views: views.map(v => ({ id: v.id, name: v.name }))
        })
    });
};

const registerGlobalComplianceOverview = (rules) => async (req, res) => {
    const groups = config.get("auth.admin_emails", "not_set") === req.oidc?.user?.email ? ["*"] : req.oidc?.user?.groups ?? ["*"];

    const globalStats = await Promise.all(rules.map(async (rule) => {
        const results = await req.unsafeDb.collection(`compliance_view_${rule.view}`)
            .aggregate([
                ...latestOnly,
                ...accountLookup,
                ...security(groups),
                {$match: { _is_empty_marker: { $exists: false }}},
                ...rule.pipeline(null),
            ])
            .toArray();

        // results[0] contains the global count because groupKey was null
        const rows = results[0]?.rows ?? [];
        const stats = rowsToDetails(rows, rule.threshold);

        return {
            ruleId: rule.id,
            ruleName: rule.name,
            description: rule.description,
            ...stats,
            percentage: stats.count === 0 ? 100 : Math.floor((stats.compliantCount / stats.count) * 100),
            threshold: rule.threshold ?? 100
        };
    }));

    res.render('overview.njk', {
        policy_title: "Overview",
        policy_description: "Overall compliance health across all accounts and teams.",
        globalStats,
        section: "compliance"
    });
};

module.exports = {registerComplianceRule, registerComplianceRuleSummary, registerGlobalComplianceOverview};
