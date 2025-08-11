const express = require('express');

module.exports = function createTaggingRouter({ breadcrumbs }) {
    const router = express.Router();

    router.get('/', (_, res) => {
        res.render('policies/tagging/index.njk', {
            breadcrumbs: [...breadcrumbs, { text: 'Tagging', href: '/reports' }],
            menu_items: [
                { href: '/compliance/tagging/', text: 'Teams Overview' },
                { href: '/compliance/tagging/', text: 'Services Overview' },
                { href: '/compliance/tagging/', text: 'CESA' },
            ]
        });
    });

    return router;
};
