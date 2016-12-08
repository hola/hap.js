const fs = require('fs');
module.exports = function(app, log) {
    app.post('/save_output', function(req, res){
        let data = [];
        let title = req.query.title;
        let type = req.query.track;
        req.on('data', function(chunk){ data.push(chunk); });
        req.on('end', function(){
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers',
                'Origin, X-Requested-With, Content-Type, Accept');
            fs.writeFileSync(`output/${title}_${type}.mp4`,
                Buffer.concat(data));
            res.status(200).send('OK');
        });
    });
};
