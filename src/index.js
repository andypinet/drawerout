import "./assets/css/index.css"
import Emitter from "./emitter"
import decouple from "decouple"

var scrollTimeout;
var scrolling = false;
var doc = window.document;
var html = doc.documentElement;
var msPointerSupported = window.navigator.msPointerEnabled;
var touch = {
    'start': msPointerSupported ? 'MSPointerDown' : 'touchstart',
    'move': msPointerSupported ? 'MSPointerMove' : 'touchmove',
    'end': msPointerSupported ? 'MSPointerUp' : 'touchend'
};
var prefix = (function prefix() {
    var regex = /^(Webkit|Khtml|Moz|ms|O)(?=[A-Z])/;
    var styleDeclaration = doc.getElementsByTagName('script')[0].style;
    for (var prop in styleDeclaration) {
        if (regex.test(prop)) {
            return '-' + prop.match(regex)[0].toLowerCase() + '-';
        }
    }
    // Nothing found so far? Webkit does not enumerate over the CSS properties of the style object.
    // However (prop in style) returns the correct value, so we'll have to test for
    // the precence of a specific property
    if ('WebkitOpacity' in styleDeclaration) { return '-webkit-'; }
    if ('KhtmlOpacity' in styleDeclaration) { return '-khtml-'; }
    return '';
}());
function hasIgnoredElements(el) {
    while (el.parentNode) {
        if (el.getAttribute('data-drawerout-ignore') !== null) {
            return el;
        }
        el = el.parentNode;
    }
    return null;
}

class Drawerout extends Emitter {
    constructor(options) {
        super();
        var self = this;

        options = options || {};


        // Sets default values
        this._startOffsetX = 0;
        this._currentOffsetX = 0;
        this._opening = false;
        this._moved = false;
        this._opened = false;
        this._preventOpen = false;

        // Sets panel
        this.panel = options.panel;
        this.menu = options.menu;
        this.overlay = document.createElement("div");
        this.overlay.id = "drawerout-overlay";
        this.overlay.className = "drawerout-overlay";
        this.overlay.s = 1;

        // Sets options
        this._touch = options.touch === undefined ? true : options.touch && true;
        this._side = options.side || 'left';
        this._easing = options.fx || options.easing || 'ease';
        this._duration = parseInt(options.duration, 10) || 300;
        this._tolerance = parseInt(options.tolerance, 10) || 70;
        this._padding = this._translateTo = parseInt(options.padding, 10) || 256;
        this._orientation = this._side === 'right' ? -1 : 1;
        this._translateTo *= this._orientation;

        // Sets  classnames
        if (!this.panel.classList.contains('drawerout-panel')) {
            this.panel.classList.add('drawerout-panel');
        }
        if (!this.panel.classList.contains('drawerout-panel-' + this._side)) {
            this.panel.classList.add('drawerout-panel-' + this._side);
        }
        if (!this.menu.classList.contains('drawerout-menu')) {
            this.menu.classList.add('drawerout-menu');
        }
        if (!this.menu.classList.contains('drawerout-menu-' + this._side)) {
            this.menu.classList.add('drawerout-menu-' + this._side);
        }

        options.container.appendChild(self.overlay);

        // Init touch events
        if (this._touch) {
            this._initTouchEvents();
        }
    }

    _initTouchEvents() {
        var self = this;

        /**
         * Decouple scroll event
         */
        this._onScrollFn = decouple(doc, 'scroll', function() {
            if (!self._moved) {
                clearTimeout(scrollTimeout);
                scrolling = true;
                scrollTimeout = setTimeout(function() {
                    scrolling = false;
                }, 250);
            }
        });

        /**
         * Prevents touchmove event if slideout is moving
         */
        this._preventMove = function(eve) {
            if (self._moved) {
                eve.preventDefault();
            }
        };

        doc.addEventListener(touch.move, this._preventMove);

        /**
         * Resets values on touchstart
         */
        this._resetTouchFn = function(eve) {
            if (typeof eve.touches === 'undefined') {
                return;
            }

            self._moved = false;
            self._opening = false;
            self._startOffsetX = eve.touches[0].pageX;

            if (self._startOffsetX < 30) {
                if (!self.overlay.classList.contains("active")) {
                    self.overlay.classList.add("active");
                }
            }
            // self._preventOpen = (!self._touch || (!self.isOpen() && self.menu.clientWidth !== 0));
        };

        this.panel.addEventListener(touch.start, this._resetTouchFn);

        this._moveTouch = function (eve) {
            if (self.overlay.classList.contains("active")) {
                if (
                    scrolling ||
                    typeof eve.touches === 'undefined' ||
                    hasIgnoredElements(eve.target)
                ) {
                    return;
                }

                var dif_x = eve.touches[0].clientX - self._startOffsetX;
                var translateX = self._currentOffsetX = -self._padding + dif_x;

                if (translateX > 0) {
                    return;
                }

                self._opening = true;
                var oriented_dif_x = dif_x * self._orientation;

                // console.log(oriented_dif_x);

                if (!self._moved) {
                    self.emit('translatestart');
                }

                if (!(self._moved && html.classList.contains('drawerout-open'))) {
                    html.classList.add('drawerout-open');
                }

                self.menu.style[prefix + 'transform'] = self.menu.style.transform = 'translateX(' + translateX + 'px)';

                self.emit('translate', translateX);
                self._moved = true;
            }
        };

        this.panel.addEventListener(touch.move, this._moveTouch);
        self.overlay.addEventListener(touch.move, this._moveTouch);

        this._moveEnd = function (e) {
            if (self.overlay.classList.contains("active")) {
                if (self._moved) {
                    self.emit('translateend');
                    (self._opening && Math.abs(self._currentOffsetX) < self._tolerance) ? self.open() : self.close();
                }
                self._moved = false;
            }
        };

        this.panel.addEventListener(touch.end, this._moveEnd);
        self.overlay.addEventListener(touch.end, this._moveEnd);


        this._onMoveCancelFn = function() {
            if (self.overlay.classList.contains("active")) {
                self._moved = false;
                self._opening = false;
            }
        };

        this.panel.addEventListener(touch.end, this._onMoveCancelFn);
        self.overlay.addEventListener('touchcancel', this._onMoveCancelFn);

        return this;
    }

    isOpen() {
        return this._opened;
    }

    close () {
        var self = this;
        if (!this.isOpen() && !this._opening) {
            return this;
        }
        this.emit('beforeclose');
        this._setTransition();
        this._translateXTo(-256);
        self.overlay.classList.remove("active");
        this._opened = false;
        setTimeout(function() {
            html.classList.remove('drawerout-open');
            self.menu.style.transition = self.menu.style['-webkit-transition'] = self.panel.style[prefix + 'transform'] = self.panel.style.transform = '';
            self.emit('close');
        }, this._duration + 50);
        return this;
    };

    open() {
        var self = this;
        this.emit('beforeopen');
        if (!html.classList.contains('drawerout-open')) {
            html.classList.add('drawerout-open');
        }
        this._setTransition();
        this._translateXTo(0);
        this._opened = true;
        setTimeout(function() {
            self.menu.style.transition = self.menu.style['-webkit-transition'] = '';
            self.emit('open');
        }, this._duration + 50);
        return this;
    }

    toggle() {
        return this.isOpen() ? this.close() : this.open();
    };

    enableTouch() {
        this._touch = true;
        return this;
    };

    disableTouch() {
        this._touch = false;
        return this;
    };

    destroy() {
        // Close before clean
        this.close();

        // Remove event listeners
        doc.removeEventListener(touch.move, this._preventMove);
        this.panel.removeEventListener(touch.start, this._resetTouchFn);
        this.panel.removeEventListener('touchcancel', this._onTouchCancelFn);
        this.panel.removeEventListener(touch.move, this._moveTouch);
        this.overlay.removeEventListener(touch.move, this._moveTouch);
        this.panel.removeEventListener(touch.end, this._moveEnd);
        this.overlay.removeEventListener(touch.end, this._moveEnd);
        this.panel.removeEventListener(touch.end, this._onMoveCancelFn);
        this.overlay.removeEventListener('touchcancel', this._onMoveCancelFn);
        doc.removeEventListener('scroll', this._onScrollFn);

        // Remove methods
        this.open = this.close = function() {};

        // Return the instance so it can be easily dereferenced
        return this;
    };

    _setTransition() {
        this.menu.style[prefix + 'transition'] = this.menu.style.transition = prefix + 'transform ' + this._duration + 'ms ' + this._easing;
        return this;
    }

    _translateXTo(translateX) {
        this._currentOffsetX = translateX;
        this.menu.style[prefix + 'transform'] = this.menu.style.transform = 'translateX(' + translateX + 'px)';
        return this;
    }
}

document.addEventListener("DOMContentLoaded", function () {
    var drawerout = new Drawerout({
        'panel': document.getElementById('panel'),
        'menu': document.getElementById('menu'),
        'container': document.getElementById('adminpage'),
        'padding': 256,
        'tolerance': 146
    });
});