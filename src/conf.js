var zdot_conf = require('./zdot_conf.js');
var external_util = require('./external_util.js');
var E = {};
var ls = typeof window!='undefined' && window.localStorage;
var urls = [];
if (typeof window!='undefined')
{
    if (window.top!=window)
        urls.push(document.referrer);
    urls.push(location.href);
}

function get_str_conf(key, s){
    var m = s.match(new RegExp('[?&#]'+key+'(=.*?)?(#|&|$)'));
    return m && (m[1] ? m[1].replace(/^=/, '') : '');
}

function get_url_conf(key){
    var m;
    urls.forEach(function(u){ m = m||get_str_conf(key, u); });
    return m;
}

function get_conf(key, def_empty){
    var res, hp_key = 'hola_provider_'+key;
    if ((res = get_url_conf(hp_key))!=null)
        console.info(E.provider_id+': using '+hp_key+' from url');
    else if (ls && (res = ls['hola_provider_'+key])!=undefined)
        console.info(E.provider_id+': using '+hp_key+' from lstorage');
    else if (E.owner && E.owner.hasAttribute(key.replace('_', '-')))
        res = E.owner.getAttribute(key.replace('_', '-'));
    else if (zdot_conf[key] && !zdot_conf[key].match(/^{\[=.*\]}$/))
        res = zdot_conf[key];
    return res || (res=='' ? def_empty : res);
}

function check_filter(arr, val, is_filter_in){
    arr = typeof arr=='string' ? [arr] : arr;
    if (!arr || !(arr instanceof Array))
        return true;
    return is_filter_in==arr.indexOf(val)>=0;
}

function is_register_disabled(){
    var v;
    // adding ?hola_provider_force or ?hola_provider_force=disabled to uri
    // overwrites register_percent and register_browser config
    if (v = get_conf('force', 'enabled'))
        return v=='disabled';
    if (v = get_conf('register_percent', 'n/a'))
    {
        if (isNaN(v)||v<0||v>100)
        {
            console.error(E.provider_id+': invalid register_percent, '+
                'expected a value between 0 and 100 but '+v+' found');
            return true;
        }
        else if (!v || Math.random()*100>v)
            return true;
    }
    if (v = get_conf('register_browser'))
    {
        var browser = external_util.user_agent.guess_browser();
        var guess = external_util.user_agent.guess();
        var platform = guess.mobile ? 'mobile' : guess.tv ? 'tv' :
            'desktop';
        if (browser.opera && browser.browser=='chrome')
            browser.browser = 'opera';
        try { v = JSON.parse(v); } catch(e){ v = {}; }
        if (!check_filter(v.browser_in, browser.browser, true) ||
            !check_filter(v.browser_out, browser.browser) ||
            !check_filter(v.os_in, guess.os, true) ||
            !check_filter(v.os_out, guess.os) ||
            !check_filter(v.platform_in, platform, true) ||
            !check_filter(v.platform_out, platform))
        {
            return true;
        }
    }
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
        init_conf.disabled = is_register_disabled();
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
