const fs = require('fs');
const path = require('path');
const tmp_prefix = `/tmp${path.sep}hap_test_`;
module.exports = function(app, log) {
    var user_agents = {};
    function get_tmp_dir(req){
        let ua = req.headers['user-agent'];
        ua = new Buffer(ua).toString('base64');
        let browser = user_agents[ua];
        if (!browser)
            browser = user_agents[ua] = {};
        return browser;
    }
    function cors(req, res, next){
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers',
            'Origin, X-Requested-With, Content-Type, Accept');
        next();
    }
    app.use(cors);
    app.post('/save_output', function(req, res){
        let data = [];
        let title = req.query.title;
        let type = req.query.track;
        let tmp_dir = get_tmp_dir(req);
        let dir = tmp_dir[title];
        if (!dir)
        {
            dir = tmp_dir[title] = fs.mkdtempSync(tmp_prefix);
            log.info(`Save '${title}' output to ${dir}`);
        }
        req.on('data', function(chunk){ data.push(chunk); });
        req.on('end', function(){
            let file_path = path.join(dir, type+'.mp4');
            let saved = false;
            try {
                fs.statSync(file_path);
                let msg = `This track is already saved: ${file_path}!`;
                log.info(msg);
                return res.status(200).send({
                    status: 'ERR',
                    text: msg
                });
            }
            catch(e){}
            fs.writeFile(file_path, Buffer.concat(data), function(err){
                if (!err)
                    return res.status(200).send({status: 'OK'});
                log.info(err);
                return res.status(200).send({
                    status: 'ERR',
                    text: `Can't save data!`
                });
            });

        });
    });
    app.get('/compare', function(req, res){
        let data = [];
        let tmp_dir = get_tmp_dir(req);
        let title = req.query.title;
        let results_dir = tmp_dir[title];
        if (!results_dir)
        {
            return res.status(200).send({
                status: 'ERR',
                text: `There is no results found!'`
            });
        }
        try { fs.statSync(results_dir); }
        catch(e)
        {
            return res.status(200).send({
                status: 'ERR',
                text: `Results output dir is not found: '${results_dir}'!`
            });
        }
        let test_dir = path.join('test', title, 'output');
        try { fs.statSync(test_dir); }
        catch(e)
        {
            return res.status(200).send({
                status: 'ERR',
                text: `Test output dir is not found: '${test_dir}'!`
            });
        }
        let files;
        try { files = fs.readdirSync(test_dir); }
        catch(e)
        {
            return res.status(200).send({
                status: 'ERR',
                text: `Can't read test output dir: '${test_dir}'!`
            });
        }
        if (!files.length)
        {
            return res.status(200).send({
                status: 'ERR',
                text: `Test output dir is empty: '${test_dir}'!`
            });
        }
        let pending = [], errs = [];
        files.forEach((file)=>{
            let exp_path = path.join(test_dir, file);
            let res_path = path.join(results_dir, file);
            let err = `Failed '${title}': ${res_path}!`;
            let expected, result;
            try { expected = fs.readFileSync(exp_path); }
            catch(e){
                errs.push(errs);
                return;
            }
            try { result = fs.readFileSync(res_path); }
            catch(e){
                errs.push(errs);
                return;
            }
            if (!expected.equals(result))
                errs.push(err);
        });
        if (!errs.length)
            return res.status(200).send({status: 'OK'});
        return res.status(200).send({
            status: 'ERR',
            text: `Errors while comparing ${title}`,
            data: errs,
        });
    });
    let live = {};
    app.get('/live', function(req, res){
        let title = req.query.title;
        let count = 10;
        let pos = live[title]||0;
        live[title] = pos+1;
        // XXX alexeym: count real segments for the ${title} case
        let last = 22;
        let manifest = `#EXTM3U
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ALLOW-CACHE:NO
#EXT-X-TARGETDURATION:8
#EXT-X-MEDIA-SEQUENCE:${pos}`;
        for (let i=pos; i<pos+count; i+=1)
        {
            manifest += '\n#EXTINF:8,';
            manifest += `\nhttp://localhost:9876/base/test/${title}/segment${i}.ts`;
            if (i==last)
            {
                manifest += '#EXT-X-ENDLIST';
                live[title] = 0;
                break;
            }
        }
        res.status(200).send(manifest);
    });
};
