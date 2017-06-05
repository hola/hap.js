// XXX volodymyr: common container for stuff copied from the main project
// for the sake of avoiding dependency
var E = module.exports = {};

// XXX vadiml: copied from pkg/util/conv.js
function parse_leaf(v, opt){
    if (!v || typeof v!='object' || Object.keys(v).length!=1)
        return v;
    if (v.__Function__ && opt.func)
        return new Function('', '"use strict";return ('+v.__Function__+');')();
    if (v.__RegExp__ && opt.re)
    {
        var parsed = /^\/(.*)\/(\w*)$/.exec(v.__RegExp__);
        if (!parsed)
            throw new Error('failed parsing regexp');
        return new RegExp(parsed[1], parsed[2]);
    }
    return v;
}
function parse_obj(v, opt){
    if (!v || typeof v!='object')
        return v;
    if (Array.isArray(v))
    {
        for (var i = 0; i<v.length; i++)
            v[i] = parse_obj(v[i], opt);
        return v;
    }
    var v2 = parse_leaf(v, opt);
    if (v2!==v)
        return v2;
    for (var key in v)
        v[key] = parse_obj(v[key], opt);
    return v;
}
E.conv = {parse_obj: parse_obj};
