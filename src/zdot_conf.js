// XXX pavlo: workaround for UglifyJS optimization
var is_set = function(v){ return v==1; };
// XXX volodymyr: change it to zdot
module.exports = {
    embedded_provider: is_set('{[=it.HOLA_EMBEDDED_PROVIDER]}'),
    register_percent: '{[=it.HOLA_REGISTER_PERCENT]}',
    register_browser: '{[=it.HOLA_REGISTER_BROWSER]}',
    hls_params: '{[=it.HOLA_HLS_PARAMS]}',
};
