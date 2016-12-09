var host = 'http://localhost:3000';
var base_path = '/base/test/';

function get_hls_sc(hls){
    return hls.streamController||hls.mediaController; }
function get_hls_bc(hls){
    return hls.bufferController; }
function concat_arrays(a, b){
    var c = new (a.constructor)(a.length+b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}
function process_response(res){
    assert(res.status==200, 'Something wrong with server');
    return res.json().then(function(json){
        if (json.status=='OK')
            return;
        if (json.data)
            console.log('Errors found:', json.data);
        assert(false, json.text);
    }, function(err){
        assert.isNotOk(err, 'Cant get json from response'); });
}

function compare(title, done){
    var url = host+'/compare?title='+title;
    return fetch(url)
    .then(process_response)
    .then(function(){ done(); })
    .catch(done);
}

describe('hls.js', function(){
    var video, hls;
    var videos = {
        'case1': base_path+'case1/playlist.m3u8',
    };
    before(function(){
        assert(Hls.isSupported(), 'No HLS supported!'); });
    beforeEach(function(){
        document.body.innerHTML = '<video id="video"></video>';
        video = document.getElementById('video');
        assert(video, 'No <video> element found');
        hls = new Hls({debug: false});
        hls.loadSource(videos[this.currentTest.title]);
    });
    for (var title in videos)
    {
        it(title, function(done) {
            assert(hls, 'No Hls found');
            var title = this.test.title;
            var sc = get_hls_sc(hls);
            var bc = get_hls_bc(hls);
            var tracks = {};
            var orig_onMediaSourceEnded = bc.onMediaSourceEnded;
            function on_data(e, track){
                assert(track, 'no data appending');
                var type = track.type;
                if (tracks[type])
                    tracks[type] = concat_arrays(tracks[type], track.data);
                else
                    tracks[type] = track.data;
            }
            bc.onMediaSourceEnded = function(){
                orig_onMediaSourceEnded.call(bc, arguments);
                assert(sc.state=='ENDED');
                hls.off('hlsBufferAppending', on_data);
                bc.onMediaSourceEnded = orig_onMediaSourceEnded;
                var url, track, pending = [];
                for (var type in tracks)
                {
                    url = host+'/save_output?title='+title+'&track='+type;
                    track = tracks[type];
                    pending.push(fetch(url, {
                        method: 'POST',
                        body: track.buffer
                    }));
                }
                Promise.all(pending)
                .then(function(responses){
                    return Promise.all(responses.map(process_response));
                }, done)
                .then(function(){ return compare(title, done); });
            };
            hls.attachMedia(video);
            assert(sc.state!='FRAG_LOADING', 'already loading');
            hls.on('hlsBufferAppending', on_data);
        });
    }
});
