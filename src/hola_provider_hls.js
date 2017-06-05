function main(){
    var conf = require('./conf.js').init('__SCRIPTID__');
    if (conf.disabled)
        return {disabled: true, attach: function(){}, detach: function(){}};
    var Hls = window.Hls = require('@hola.org/hls.js').default;
    var provider = require('__PROVIDER__');
    provider.Hls = Hls;
    provider.version = '__VERSION__';
    provider.provider_version = provider.VERSION;
    provider.hls_version = provider.Hls.version;
    provider.hls_params = conf.hls_params;
    if (conf.autoinit)
        provider.attach();
    return provider;
}

try { module.exports = main(); }
catch(e){ module.exports = {init_failure: e}; }
