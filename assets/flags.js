// Default when the middleware does not answer: Wall hidden. The live value
// comes from middleware.js (see lib/features.js).
(function(){var W=window.JR_WALL={"on":false,"owner":false};var show=W.on||(W.owner&&/^\/(wall|u\/)/.test(location.pathname));var d=document.documentElement;d.classList.add(show?'wall-on':'wall-off');var s=document.createElement('style');s.textContent='.wall-off [data-wall],.wall-on [data-nowall]{display:none!important}';(document.head||d).appendChild(s);})();
