try {
    var Hls = window.Hls = require('@hola.org/hls.js').default;
    var provider = module.exports = require('__PROVIDER__');
    provider.Hls = Hls;
    provider.version = '__VERSION__';
    provider.hls_version = provider.Hls.version;
    provider.provider_version = provider.VERSION;
}
catch(e){ module.exports = {init_failure: e}; }
