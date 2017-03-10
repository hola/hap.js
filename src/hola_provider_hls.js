var provider = module.exports = require('__PROVIDER__');
window.Hls = provider.Hls = require('@hola.org/hls.js').default;
provider.version = '__VERSION__';
provider.hls_version = provider.Hls.version;
provider.provider_version = provider.VERSION;
