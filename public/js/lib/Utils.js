/*global requirejs:true, require:true, define:true*/
/**
 * Utils
 * @author Klimashkin P.
 */
define(['jquery', 'lib/jquery/plugins/extends'], function ($) {
    var Utils = {

        /**
         * Merge src properties into dest
         * @param {!Object} dest
         * @return {!Object}
         */
        extend: function (dest) {
            var sources = Array.prototype.slice.call(arguments, 1), i, j, len, src;
            for (j = 0, len = sources.length; j < len; j++) {
                src = sources[j] || {};
                for (i in src) {
                    if (src.hasOwnProperty(i)) {
                        dest[i] = src[i];
                    }
                }
            }
            return dest;
        },

        /**
         * Class powers the OOP facilities of the library. Thanks to John Resig and Dean Edwards for inspiration!
         */
        Class: (function () {
            var Class = function () {
            };

            /**
             *
             * @param {!Object} props
             * @return {Function} Class
             */
            Class.extend = function (props) {
                var NewClass, F, proto, i;

                // extended class with the new prototype
                NewClass = function () {
                    if (this.initialize) {
                        this.initialize.apply(this, arguments);
                    }
                };

                // instantiate class without calling constructor
                F = function () {
                };
                F.prototype = this.prototype;

                proto = new F();
                proto.constructor = NewClass;

                NewClass.prototype = proto;

                //inherit parent's statics
                for (i in this) {
                    if (this.hasOwnProperty(i) && i !== 'prototype') {
                        NewClass[i] = this[i];
                    }
                }

                // mix static properties into the class
                if (props.statics) {
                    Utils.extend(NewClass, props.statics);
                    delete props.statics;
                }

                // mix includes into the prototype
                if (props.includes) {
                    Utils.extend.apply(null, [proto].concat(props.includes));
                    delete props.includes;
                }

                // merge options
                if (props.options && proto.options) {
                    props.options = Utils.extend({}, proto.options, props.options);
                }

                // mix given properties into the prototype
                Utils.extend(proto, props);

                return NewClass;
            };


            // method for adding properties to prototype
            Class.include = function (props) {
                Utils.extend(this.prototype, props);
            };

            Class.mergeOptions = function (options) {
                Utils.extend(this.prototype.options, options);
            };

            return Class;
        }()),

        /**
         * Проверяет на соответствие объекта типу (вместо typeof)
         * @param {string} type Имя типа.
         * @param {Object} obj Проверяемый объект.
         * @return {boolean}
         */
        isObjectType: function (type, obj) {
            return Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase();
        },

        isObjectEmpty: function (obj) {
            return this.getObjectPropertyLength(obj) === 0;
        },

        isObjectsEqual: function (obj1, obj2) {
            var p1 = this.getOwnPropertyNames(obj1), i = p1.length, prop,
                p2 = this.getOwnPropertyNames(obj2);
            if (i === p2.length) {
                while (i--) {
                    prop = p1[i];
                    if (!obj2.hasOwnProperty(prop)) {
                        return false;
                    }
                }
                return true;
            }
            return false;
        },

        getObjectPropertyLength: function (obj) {
            var result = 0, prop;
            if (Object.getOwnPropertyNames) { //ECMAScript 5
                result = Object.getOwnPropertyNames(obj).length;
            } else { //ECMAScript 3
                for (prop in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                        result += 1;
                    }
                }
            }
            return result;
        },

        /*getObjectOneOwnPropertyName: function(obj){
         return this.getOwnPropertyNames(obj)[0];
         },
         getObjectOneOwnProperty: function(obj){
         return obj[this.getObjectOneOwnPropertyName(obj)];
         },*/
        getObjectOneOwnProperty: function (obj) {
            var prop;
            if (Utils.getObjectPropertyLength(obj) > 0) {
                if (Object.getOwnPropertyNames) { //ECMAScript 5
                    return Object.getOwnPropertyNames(obj)[0];
                } else { //ECMAScript 3
                    for (prop in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                            return prop;
                        }
                    }
                }
            }
        },

        cloneObject: function cloneObject(o) {
            if (!o || 'object' !== typeof o) {
                return o;
            }
            var c = 'function' === typeof o.pop ? [] : {}, p, v;
            for (p in o) {
                if (o.hasOwnProperty(p)) {
                    v = o[p];
                    if (v && 'object' === typeof v) {
                        c[p] = cloneObject(v);
                    } else {
                        c[p] = v;
                    }
                }
            }
            return c;
        },

        printObject: function (o) {
            var out = '', p;
            for (p in o) {
                if (o.hasOwnProperty(p)) {
                    out += p + ': ' + o[p] + '\n';
                }
            }
            return out;
        },

        /**
         * Загружает изображение и по завешению загрузки вызывает callback
         * @param url
         * @param callback
         */
        loadImage: function (url, callback, context, callbackParam) {
            var loadImg = new Image();
            loadImg.onload = function (evt) {
                if (Utils.isObjectType('function', callback)) {
                    callback.call(context, callbackParam);
                }
                loadImg = null;
            };
            loadImg.src = url;
        },

        /**
         * Возвращает значение параметра из строки адреса, содержащей параметры, или переданной строки
         * @param name Имя параметра
         * @param url Часть строки, начиная со знака ?
         * @return {String|null}
         */
        getURLParameter: function (name, url) {
            return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(url || location.search) || [, ""])[1].replace(/\+/g, '%20')) || null;
        },

        /**
         * Возвращает значение data- параметра dom-элемента
         * @param ele Элемент
         * @param name Имя параметра
         */
        getDataParam: (function () {
            "use strict";
            if (!!document.createElement('div').dataset) {
                return function (ele, name) {
                    return ele.dataset[name];
                };
            } else {
                return function (ele, name) {
                    return ele.getAttribute('data-' + name);
                };
            }
        }()),

        randomString: function (length) {
            'use strict';
            var chars = String('0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz').split(''),
                str = '',
                i;

            if (!length) {
                length = Math.floor(Math.random() * chars.length);
            }

            for (i = 0; i < length; i += 1) {
                str += chars[Math.floor(Math.random() * chars.length)];
            }
            chars = i = null;
            return str;
        },

        cutStringByWord: function (text, n) {
            "use strict";
            var cut = text.lastIndexOf(' ', n);
            if (cut === -1) {
                return text.substr(0, n);
            }
            return text.substring(0, cut);
        },

        /**
         *
         * @param time Время в миллисекундах
         * @param update Колбэк, вызываемый каждую секунду. Передается параметр - секунд осталось
         * @param complete
         */
        timer: function timer(time, update, complete) {
            var start = new Date().getTime(),
                interval = setInterval(function () {
                    var now = time - (new Date().getTime() - start);
                    if (now <= 0) {
                        clearInterval(interval);
                        if (complete) {
                            complete();
                        }
                    } else if (update) {
                        update(now / 1000 >> 0);
                    }
                }, 100); // the smaller this number, the more accurate the timer will be
        },

        formatFileSize: function (bytes) {
            if (typeof bytes !== 'number') {
                return '';
            }
            if (bytes >= 1000000000) {
                return (bytes / 1000000000).toFixed(2) + ' GB';
            }
            if (bytes >= 1000000) {
                return (bytes / 1000000).toFixed(2) + ' MB';
            }
            return (bytes / 1000).toFixed(2) + ' KB';
        },

        formatBitrate: function (bits) {
            if (typeof bits !== 'number') {
                return '';
            }
            if (bits >= 1000000000) {
                return (bits / 1000000000).toFixed(2) + ' Gbit/s';
            }
            if (bits >= 1000000) {
                return (bits / 1000000).toFixed(2) + ' Mbit/s';
            }
            if (bits >= 1000) {
                return (bits / 1000).toFixed(2) + ' kbit/s';
            }
            return bits.toFixed(2) + ' bit/s';
        },

        secondsToTime: function (secs) {
            "use strict";
            if (secs < 60) {
                return '0:' + (secs > 9 ? secs : '0' + secs);
            }

            var hours = (secs / (60 * 60)) >> 0,
                divisor_for_minutes = secs % (60 * 60),
                minutes = (divisor_for_minutes / 60) >> 0,
                divisor_for_seconds = divisor_for_minutes % 60,
                seconds = Math.ceil(divisor_for_seconds);

            return (hours > 0 ? hours + ':' + (minutes > 9 ? minutes : '0' + minutes) : minutes) + ':' + (seconds > 9 ? seconds : '0' + seconds);
        },

        formatPercentage: function (floatValue) {
            return (floatValue * 100).toFixed(2) + ' %';
        },

        mousePageXY: function (e) {
            var x = 0, y = 0, et;
            if (!e) {
                e = window.event;
            }
            if (e.touches && e.touches.item && e.touches.item(0)) {
                et = e.touches.item(0);
                if (et.pageX || et.pageY) {
                    x = et.pageX;
                    y = et.pageY;
                } else if (et.clientX || et.clientY) {
                    x = et.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
                    y = et.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
                }
            } else if (e.pageX || e.pageY) {
                x = e.pageX;
                y = e.pageY;
            } else if (e.clientX || e.clientY) {
                x = e.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
                y = e.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
            }
            return {"x": x, "y": y};
        },

        /**
         * Caps Lock Detector 1.0
         * @author Igor Tigirlas, last update 05.08.2005
         * @param evt
         */
        capsLockDetect: function (evt) {
            if (!evt) {
                evt = window.event || null;
            }
            if (!evt) {
                return;
            }

            var n = evt.keyCode || evt.charCode;

            if (evt.type === "keypress") {
                var c = String.fromCharCode(n),
                    cUC = c.toUpperCase(),
                    cLC = c.toLowerCase();

                if (cUC !== cLC) {
                    return ((evt.shiftKey && cLC === c) || (!evt.shiftKey && cUC === c));
                }
            } else if (evt.type === "keydown" && n === 20) {
                return false;
            }
        },


        getClientWidth: function () {
            if (window.opera && window.innerWidth) {
                return window.innerWidth;
            } else {
                return (document.compatMode === 'CSS1Compat' && !window.opera ?
                        document.documentElement.clientWidth :
                        document.body.clientWidth);
            }
        },

        getClientHeight: function () {
            return window.opera && window.innerWidth ? window.innerWidth : (document.compatMode === 'CSS1Compat' && !window.opera ?
                                                                            document.documentElement.clientHeight :
                                                                            document.body.clientHeight);
        },

        getBodyScrollTop: function () {
            return window.pageYOffset ||
                (document.documentElement && document.documentElement.scrollTop) ||
                (document.body && document.body.scrollTop);
        },

        getBodyScrollLeft: function () {
            return window.pageXOffset ||
                (document.documentElement && document.documentElement.scrollLeft) ||
                (document.body && document.body.scrollLeft);
        },

        getDocumentHeight: function () {
            var scrollHeight = document.body.scrollHeight,
                offsetHeight = document.body.offsetHeight;
            return (scrollHeight > offsetHeight) ? scrollHeight : offsetHeight;
        },

        getDocumentWidth: function () {
            var scrollWidth = document.body.scrollWidth,
                offsetWidth = document.body.offsetWidth;

            return (scrollWidth > offsetWidth) ? scrollWidth : offsetWidth;
        },

        getElementComputedStyle: function (elem, prop) {
            if (typeof elem !== "object") {
                elem = document.getElementById(elem);
            }
            // external stylesheet for Mozilla, Opera 7+ and Safari 1.3+
            if (document.defaultView && document.defaultView.getComputedStyle) {
                if (prop.match(/[A-Z]/)) {
                    prop = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
                }
                return document.defaultView.getComputedStyle(elem, "").getPropertyValue(prop);
            }
            // external stylesheet for Explorer and Opera 9
            if (elem.currentStyle) {
                var i;
                while ((i = prop.indexOf("-")) !== -1) {
                    prop = prop.substr(0, i) + prop.substr(i + 1, 1).toUpperCase() + prop.substr(i + 2);
                }
                return elem.currentStyle[prop];
            }
            return "";
        },

        /**
         * @param {!HTMLElement} elem HTML Element.
         * @return {{top: number, left: number}} Element's position related to the
         * window.
         */
        getOffset: function (elem) {
            if (elem.getBoundingClientRect) {
                return getOffsetRect(elem);
            } else {
                return getOffsetSum(elem);
            }
        },

        getDistance: function (x1, x2, y1, y2) {
            return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
        },

        getCookie: (function () {
            if (typeof window.getCookie === 'function') {
                var func = window.getCookie;
                delete window.getCookie;
                return func;
            } else {
                return function (name) {
                    var matches = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+\^])/g, '\\$1') + "=([^;]*)"));
                    return matches ? decodeURIComponent(matches[1]) : undefined;
                };
            }
        }()),
        setCookie: (function () {
            if (typeof window.setCookie === 'function') {
                var func = window.setCookie;
                delete window.setCookie;
                return func;
            } else {
                return function (name, value, props) {
                    props = props || {};
                    var exp = props.expires,
                        d,
                        updatedCookie,
                        propName,
                        propValue;
                    if (typeof exp === "number" && exp) {
                        d = new Date();
                        d.setTime(d.getTime() + exp * 1000);
                        exp = props.expires = d;
                    }
                    if (exp && exp.toUTCString) {
                        props.expires = exp.toUTCString();
                    }

                    value = encodeURIComponent(value);
                    updatedCookie = name + "=" + value;
                    for (propName in props) {
                        if (props.hasOwnProperty(propName)) {
                            updatedCookie += "; " + propName;
                            propValue = props[propName];
                            if (propValue !== true) {
                                updatedCookie += "=" + propValue;
                            }
                        }
                    }
                    document.cookie = updatedCookie;
                };
            }
        }()),
        deleteCookie: (function () {
            if (typeof window.deleteCookie === 'function') {
                var func = window.deleteCookie;
                delete window.deleteCookie;
                return func;
            } else {
                return function (name) {
                    Utils.setCookie(name, null, { expires: -1 });
                };
            }
        }()),

        /**
         * Converts an RGB in hex color value to HSL. Conversion formula
         * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
         * Assumes HTMLcolor (like '00ff99') and
         * returns h, s, and l in the set [0, 1].
         */
        hex2hsl: function (HTMLcolor) {
            var r = parseInt(HTMLcolor.substring(0, 2), 16) / 255,
                g = parseInt(HTMLcolor.substring(2, 4), 16) / 255,
                b = parseInt(HTMLcolor.substring(4, 6), 16) / 255,
                max = Math.max(r, g, b),
                min = Math.min(r, g, b),
                d = max - min,
                h,
                s,
                l = (max + min) / 2;
            if (max === min) {
                h = s = 0;
            } else {
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
                }
                h /= 6;
            }
            return {h: h, s: s, l: l};
        },

        /**
         * Converts an HSL color value to RGB. Conversion formula
         * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
         * Assumes h, s, and l are contained in the set [0, 1] and
         * returns r, g, and b in the set [0, 255].
         */
        hslToRgb: function (h, s, l) {
            var r, g, b, hue2rgb, q, p;

            if (s === 0) {
                r = g = b = l; // achromatic
            } else {
                hue2rgb = function (p, q, t) {
                    if (t < 0) {
                        t += 1;
                    }
                    if (t > 1) {
                        t -= 1;
                    }
                    if (t < 1 / 6) {
                        return p + (q - p) * 6 * t;
                    }
                    if (t < 1 / 2) {
                        return q;
                    }
                    if (t < 2 / 3) {
                        return p + (q - p) * (2 / 3 - t) * 6;
                    }
                    return p;
                };

                q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                p = 2 * l - q;
                r = hue2rgb(p, q, h + 1 / 3);
                g = hue2rgb(p, q, h);
                b = hue2rgb(p, q, h - 1 / 3);
            }

            return {r: r * 255, g: g * 255, b: b * 255};
        },

        /**
         * Converts an RGB color value to HSV. Conversion formula
         * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
         * Assumes HTMLcolor and
         * returns h, s, and v in the set [0, 1].
         */
        rgbToHsv: function (HTMLcolor) {
            var r = parseInt(HTMLcolor.substring(0, 2), 16) / 255,
                g = parseInt(HTMLcolor.substring(2, 4), 16) / 255,
                b = parseInt(HTMLcolor.substring(4, 6), 16) / 255,
                max = Math.max(r, g, b),
                min = Math.min(r, g, b),
                d = max - min,
                h,
                s = max === 0 ? 0 : d / max;

            if (max === min) {
                h = 0; // achromatic
            } else {
                switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
                }
                h /= 6;
            }

            return [h, s, max];
        },

        /**
         * Converts an HSV color value to RGB. Conversion formula
         * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
         * Assumes h, s, and v are contained in the set [0, 1] and
         * returns r, g, and b in the set [0, 255].
         */
        hsvToRgb: function (h, s, v) {
            var r, g, b,
                i = Math.floor(h * 6),
                f = h * 6 - i,
                p = v * (1 - s),
                q = v * (1 - f * s),
                t = v * (1 - (1 - f) * s);

            switch (i % 6) {
            case 0:
                r = v;
                g = t;
                b = p;
                break;
            case 1:
                r = q;
                g = v;
                b = p;
                break;
            case 2:
                r = p;
                g = v;
                b = t;
                break;
            case 3:
                r = p;
                g = q;
                b = v;
                break;
            case 4:
                r = t;
                g = p;
                b = v;
                break;
            case 5:
                r = v;
                g = p;
                b = q;
                break;
            }

            return [r * 255, g * 255, b * 255];
        },

        Event: (function () {

            var guid = 0;

            function returnFalse() {
                this.returnValue = false;
            }

            function cancelBubble() {
                this.cancelBubble = true;
            }

            function stopAllAftermath() {
                if (this.stopImmediatePropagation) {
                    this.stopImmediatePropagation();
                } else if (this.stopPropagation) {
                    this.stopPropagation();
                }
                if (this.preventDefault) {
                    this.preventDefault();
                }
            }

            function fixEvent(event) {
                event = event || window.event;

                if (event.isFixed) {
                    return event;
                }
                event.isFixed = true;

                event.preventDefault = event.preventDefault || returnFalse;
                event.stopPropagation = event.stopPropagation || cancelBubble;
                event.stopAllAftermath = stopAllAftermath;

                if (!event.target) {
                    event.target = event.srcElement;
                }

                if (!event.relatedTarget && event.fromElement) {
                    event.relatedTarget = event.fromElement === event.target ?
                                          event.toElement : event.fromElement;
                }

                if (!event.which && event.button) {
                    event.which = (event.button & 1 ?
                                   1 : (event.button & 2 ?
                                        3 : (event.button & 4 ?
                                             2 : 0)));
                }
                return event;
            }

            /* Вызывается в контексте элемента всегда this = element */
            function commonHandle(event) {
                event = fixEvent(event);

                var handlers = this.events[event.type],
                    handler,
                    g,
                    ret;

                for (g in handlers) {
                    if (handlers.hasOwnProperty(g)) {
                        handler = handlers[g];

                        ret = handler.call(this, event);
                        if (ret === false) {
                            event.stopAllAftermath();
                        }
                    }
                }
            }

            return {
                add: function (elem, type, handler) {
                    if (elem.setInterval && (elem !== window && !elem.frameElement)) {
                        elem = window;
                    }

                    if (!handler.guid) {
                        handler.guid = ++guid;
                    }

                    if (!elem.events) {
                        elem.events = {};
                        elem.handle = function (event) {
                            if (typeof event !== "undefined") {
                                return commonHandle.call(elem, event);
                            }
                        };
                    }

                    if (!elem.events[type]) {
                        elem.events[type] = {};

                        if (elem.addEventListener) {
                            elem.addEventListener(type, elem.handle, false);
                        } else if (elem.attachEvent) {
                            elem.attachEvent("on" + type, elem.handle);
                        }
                    }

                    elem.events[type][handler.guid] = handler;

                    return elem;
                },

                getEventArray: function (elem) {
                    var res = [],
                        elemEvents = elem.events,
                        type,
                        handle;
                    for (type in elemEvents) {
                        if (elemEvents.hasOwnProperty(type)) {
                            for (handle in elemEvents[type]) {
                                if (elemEvents[type].hasOwnProperty(handle)) {
                                    res.push({type: type, handler: elemEvents[type][handle]});
                                }
                            }
                        }
                    }
                    elemEvents = type = handle = null;
                    return res;
                },

                remove: function (elem, type, handler) {
                    var handlers = elem.events && elem.events[type],
                        any;

                    if (!handlers) {
                        return elem;
                    }

                    delete handlers[handler.guid];

                    for (any in handlers) {
                        if (handlers.hasOwnProperty(any)) {
                            return elem;
                        }
                    }
                    if (elem.removeEventListener) {
                        elem.removeEventListener(type, elem.handle, false);
                    } else if (elem.detachEvent) {
                        elem.detachEvent("on" + type, elem.handle);
                    }

                    delete elem.events[type];

                    for (any in elem.events) {
                        if (elem.events.hasOwnProperty(any)) {
                            return elem;
                        }
                    }
                    try {
                        delete elem.handle;
                        delete elem.events;
                    } catch (e) { // IE
                        elem.removeAttribute("handle");
                        elem.removeAttribute("events");
                    }
                    return elem;
                },

                removeAll: function (elem) {
                    var events = this.getEventArray(elem),
                        numberOfRemoved = events.length,
                        e;
                    for (e = 0; e < events.length; e++) {
                        this.remove(elem, events[e].type, events[e].handler);
                    }
                    events = null;
                    return numberOfRemoved;
                }
            };
        }()),

        /**
         * Creates Style element in head.
         * @param {!string=} src location.
         */
        addStyle: function (src, doneCallback) {
            var dfd = $.Deferred();
            dfd.done(function () {
                console.log("Source '%s' loaded success", src);
                if (doneCallback) {
                    doneCallback();
                }
            });
            $.getStyle(src, dfd.resolve);
            return dfd.promise();
        },
        /**
         * Creates Script element in head.
         * @param {!string=} src location.
         */
        addScript: function (src, doneCallback) {
            var dfd = $.Deferred();

            dfd.done(function (script, textStatus) {
                console.log("Source '%s' loaded %s", src, textStatus);
                if (doneCallback) {
                    doneCallback();
                }
            });

            $.cachedScript(src).done(dfd.resolve);
            return dfd.promise();
        },

        /**
         * Creates DOM Element.
         */
        debug: function (msg) {
            if (console && console.log) {
                console.log(msg);
            }
        }
    };


    /**
     * @param {!HTMLElement} elem HTML Element.
     * @return {{top: number, left: number}} Element's position related to the
     * window using the offsets sum (obsolete way).
     */
    function getOffsetSum(elem) {
        var top = 0, left = 0, html = document.getElementsByTagName('html')[0];
        while (elem) {
            top = top + parseInt(elem.offsetTop, 10);
            left = left + parseInt(elem.offsetLeft, 10);
            elem = elem.offsetParent;
        }

        if (html) { // маргины html не учитываются при суммировании оффсетов
            top += parseInt(Utils.getElementComputedStyle(html, 'margin-top'), 10);
            left += parseInt(Utils.getElementComputedStyle(html, 'margin-left'), 10);
        }
        return {top: top, left: left};
    }

    /**
     * @param {!HTMLElement} elem HTML Element.
     * @return {{top: number, left: number}} Element's position related to the
     * window using getBoundingClientRect (proper way).
     */
    function getOffsetRect(elem) {
        var box = elem.getBoundingClientRect(),

            body = document.body,
            docElem = document.documentElement,

            scrollTop = window.pageYOffset ||
                docElem.scrollTop ||
                body.scrollTop,

            scrollLeft = window.pageXOffset ||
                docElem.scrollLeft ||
                body.scrollLeft,

            clientTop = docElem.clientTop || body.clientTop || 0,
            clientLeft = docElem.clientLeft || body.clientLeft || 0,

            top = box.top + scrollTop - clientTop,
            left = box.left + scrollLeft - clientLeft;

        return {top: Math.round(top), left: Math.round(left)};
    }

    return Utils;
})
;