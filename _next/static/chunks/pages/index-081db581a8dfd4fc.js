(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[405],{4423:function(e,t,n){(window.__NEXT_P=window.__NEXT_P||[]).push(["/",function(){return n(6440)}])},6440:function(e,t,n){"use strict";n.r(t),n.d(t,{default:function(){return a}});var r=n(4246),o=(0,n(5218).default)((function(){return Promise.all([n.e(90),n.e(745),n.e(683)]).then(n.bind(n,3683))}),{loadableGenerated:{webpack:function(){return[3683]},modules:["index.tsx -> ../components/Demo"]},ssr:!1});function a(){return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("h1",{children:(0,r.jsx)("kbd",{children:"ace-tracer"})}),(0,r.jsxs)("p",{children:["Visit the ",(0,r.jsx)("a",{href:"https://github.com/cs124-illinois/ace-tracer",children:"project homepage"})]}),(0,r.jsx)("h2",{children:"Demo"}),(0,r.jsx)(o,{})]})}},9906:function(e,t,n){"use strict";function r(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function o(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{},o=Object.keys(n);"function"===typeof Object.getOwnPropertySymbols&&(o=o.concat(Object.getOwnPropertySymbols(n).filter((function(e){return Object.getOwnPropertyDescriptor(n,e).enumerable})))),o.forEach((function(t){r(e,t,n[t])}))}return e}t.default=function(e,t){var n=a.default,r={loading:function(e){e.error,e.isLoading;return e.pastDelay,null}};u=e,l=Promise,(null!=l&&"undefined"!==typeof Symbol&&l[Symbol.hasInstance]?l[Symbol.hasInstance](u):u instanceof l)?r.loader=function(){return e}:"function"===typeof e?r.loader=e:"object"===typeof e&&(r=o({},r,e));var u,l;var s=r=o({},r,t);if(s.suspense)throw new Error("Invalid suspense option usage in next/dynamic. Read more: https://nextjs.org/docs/messages/invalid-dynamic-suspense");if(s.suspense)return n(s);r.loadableGenerated&&delete(r=o({},r,r.loadableGenerated)).loadableGenerated;if("boolean"===typeof r.ssr){if(!r.ssr)return delete r.ssr,i(n,r);delete r.ssr}return n(r)};u(n(7378));var a=u(n(2456));function u(e){return e&&e.__esModule?e:{default:e}}function i(e,t){return delete t.webpack,delete t.modules,e(t)}},7815:function(e,t,n){"use strict";var r;Object.defineProperty(t,"__esModule",{value:!0}),t.LoadableContext=void 0;var o=((r=n(7378))&&r.__esModule?r:{default:r}).default.createContext(null);t.LoadableContext=o},2456:function(e,t,n){"use strict";function r(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(e,r.key,r)}}function o(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function a(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{},r=Object.keys(n);"function"===typeof Object.getOwnPropertySymbols&&(r=r.concat(Object.getOwnPropertySymbols(n).filter((function(e){return Object.getOwnPropertyDescriptor(n,e).enumerable})))),r.forEach((function(t){o(e,t,n[t])}))}return e}Object.defineProperty(t,"__esModule",{value:!0}),t.default=void 0;var u,i=(u=n(7378))&&u.__esModule?u:{default:u},l=n(3247),s=n(7815);var c=[],d=[],f=!1;function p(e){var t=e(),n={loading:!0,loaded:null,error:null};return n.promise=t.then((function(e){return n.loading=!1,n.loaded=e,e})).catch((function(e){throw n.loading=!1,n.error=e,e})),n}var h=function(){function e(t,n){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this._loadFn=t,this._opts=n,this._callbacks=new Set,this._delay=null,this._timeout=null,this.retry()}var t,n,o;return t=e,(n=[{key:"promise",value:function(){return this._res.promise}},{key:"retry",value:function(){var e=this;this._clearTimeouts(),this._res=this._loadFn(this._opts.loader),this._state={pastDelay:!1,timedOut:!1};var t=this._res,n=this._opts;if(t.loading){if("number"===typeof n.delay)if(0===n.delay)this._state.pastDelay=!0;else{var r=this;this._delay=setTimeout((function(){r._update({pastDelay:!0})}),n.delay)}if("number"===typeof n.timeout){var o=this;this._timeout=setTimeout((function(){o._update({timedOut:!0})}),n.timeout)}}this._res.promise.then((function(){e._update({}),e._clearTimeouts()})).catch((function(t){e._update({}),e._clearTimeouts()})),this._update({})}},{key:"_update",value:function(e){this._state=a({},this._state,{error:this._res.error,loaded:this._res.loaded,loading:this._res.loading},e),this._callbacks.forEach((function(e){return e()}))}},{key:"_clearTimeouts",value:function(){clearTimeout(this._delay),clearTimeout(this._timeout)}},{key:"getCurrentValue",value:function(){return this._state}},{key:"subscribe",value:function(e){var t=this;return this._callbacks.add(e),function(){t._callbacks.delete(e)}}}])&&r(t.prototype,n),o&&r(t,o),e}();function y(e){return function(e,t){var n=function(){if(!o){var t=new h(e,r);o={getCurrentValue:t.getCurrentValue.bind(t),subscribe:t.subscribe.bind(t),retry:t.retry.bind(t),promise:t.promise.bind(t)}}return o.promise()},r=Object.assign({loader:null,loading:null,delay:200,timeout:null,webpack:null,modules:null,suspense:!1},t);r.suspense&&(r.lazy=i.default.lazy(r.loader));var o=null;if(!f&&"function"===typeof r.webpack&&!r.suspense){var u=r.webpack();d.push((function(e){var t=!0,r=!1,o=void 0;try{for(var a,i=u[Symbol.iterator]();!(t=(a=i.next()).done);t=!0){var l=a.value;if(-1!==e.indexOf(l))return n()}}catch(s){r=!0,o=s}finally{try{t||null==i.return||i.return()}finally{if(r)throw o}}}))}var c=r.suspense?function(e,t){return i.default.createElement(r.lazy,a({},e,{ref:t}))}:function(e,t){n();var a=i.default.useContext(s.LoadableContext),u=l.useSubscription(o);return i.default.useImperativeHandle(t,(function(){return{retry:o.retry}}),[]),a&&Array.isArray(r.modules)&&r.modules.forEach((function(e){a(e)})),i.default.useMemo((function(){return u.loading||u.error?i.default.createElement(r.loading,{isLoading:u.loading,pastDelay:u.pastDelay,timedOut:u.timedOut,error:u.error,retry:o.retry}):u.loaded?i.default.createElement(function(e){return e&&e.__esModule?e.default:e}(u.loaded),e):null}),[e,u])};return c.preload=function(){return!r.suspense&&n()},c.displayName="LoadableComponent",i.default.forwardRef(c)}(p,e)}function b(e,t){for(var n=[];e.length;){var r=e.pop();n.push(r(t))}return Promise.all(n).then((function(){if(e.length)return b(e,t)}))}y.preloadAll=function(){return new Promise((function(e,t){b(c).then(e,t)}))},y.preloadReady=function(e){var t=void 0===e?[]:e;return new Promise((function(e){var n=function(){return f=!0,e()};b(d,t).then(n,n)}))},window.__NEXT_PRELOADREADY=y.preloadReady;var m=y;t.default=m},5218:function(e,t,n){e.exports=n(9906)}},function(e){e.O(0,[774,888,179],(function(){return t=4423,e(e.s=t);var t}));var t=e.O();_N_E=t}]);