var zdot_conf = require('./zdot_conf.js');
var external_util = require('./external_util.js');
var E = {};
var ls = typeof window!='undefined' && window.localStorage;
var uri = typeof window!='undefined' &&
    (window.top===window ? location.href : document.referrer);

function get_uri_conf(key){
    var m = uri.match(new RegExp('[?&#]'+key+'(=.*?)?(#|&|$)'));
    return m && (m[1] ? m[1].replace(/^=/, '') : '');
}

function get_conf(key, def_empty){
    var res, hp_key = 'hola_provider_'+key;
    if (uri && (res = get_uri_conf(hp_key))!=null)
        console.info(E.provider_id+': using '+hp_key+' from uri');
    else if (ls && (res = ls['hola_provider_'+key])!=undefined)
        console.info(E.provider_id+': using '+hp_key+' from lstorage');
    else if (E.owner && E.owner.hasAttribute(key.replace('_', '-')))
        res = E.owner.getAttribute(key.replace('_', '-'));
    else if (zdot_conf[key] && !zdot_conf[key].match(/^{\[=.*\]}$/))
        res = zdot_conf[key];
    return res || (res=='' ? def_empty : res);
}

E.init = function(provider_id){
    E.provider_id = provider_id;
    E.owner = document.currentScript ||
        document.querySelector('#'+E.provider_id);
    var v, init_conf = {autoinit: true, disabled: false, hls_params: {}};
    if (zdot_conf.embedded_provider)
        init_conf.autoinit = false;
    else
    {
        if (get_conf('manual_init', true))
            init_conf.autoinit = false;
        if (v = get_conf('force', 'enabled'))
            init_conf.disabled = v=='disabled';
        else if (v = get_conf('register_percent', 'n/a'))
        {
            if (isNaN(v)||v<0||v>100)
            {
                console.error(provider_id+': invalid register_percent conf, '+
                    'expected a value between 0 and 100 but '+v+' found');
                init_conf.disabled = true;
            }
            else if (!v || Math.random()*100>v)
                init_conf.disabled = true;
        }
    }
    if (v = get_conf('hls_params'))
    {
        try {
            init_conf.hls_params = external_util.conv.parse_obj(
                JSON.parse(v), {func: true, re: true});
        } catch(e){}
    }
    return init_conf;
};

module.exports = E;
