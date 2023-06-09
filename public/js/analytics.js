/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['underscore', 'Params'], function (_, P) {
    'use strict';

    /**
     * Initialise GA4
     *
     * @param {object} additionalConfigInfo
     */
    const install = function(additionalConfigInfo = {}) {
        const trackingID = P.settings.analytics.trackingID;

        if (!trackingID) {
            return;
        }

        // Once script is loaded, it will process dataLayer queue, so no need to wait.
        require([`https://www.googletagmanager.com/gtag/js?id=${trackingID}`]);

        window.dataLayer = window.dataLayer || [];

        gtag('js', new Date());
        gtag('config', trackingID, additionalConfigInfo);
    };

    /**
     * Send data to Google Analytics.
     */
    window.gtag = function () {
        if (window.dataLayer) {
            window.dataLayer.push(arguments);
        }
    };

    /**
     * Proxy legacy analytics.js (UA) events to gtag.js (GA4).
     *
     * This function may be removed when all legacy ga events are migrated.
     * legacy ref: https://developers.google.com/analytics/devguides/collection/analyticsjs/events
     */
    window.ga = function () {
        const args = _.toArray(arguments);
        const pluginName = args.shift();
        const methodName = args.shift();

        // Proxy GA events.
        if (pluginName === 'send' && methodName === 'event') {
            const [eventCategory, eventAction, eventLabel, eventValue] = args;

            gtag('event', eventAction, {
                'event_category': eventCategory,
                'event_label': eventLabel,
                'value': eventValue,
            });
        }
    };

    return {
        install: install,
        setUserID: setUserID,
    };
});
