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
    assert.equal(res.status, 200, 'Something wrong with server');
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
    var videos = {};
    before(function(){
        assert(Hls.isSupported(), 'No HLS supported!'); });
    beforeEach(function(){
        document.body.innerHTML = '<video id="video"></video>';
        video = document.getElementById('video');
        assert(video, 'No <video> element found');
        hls = new Hls({debug: true});
        var title = this.currentTest.title;
        var video_url = videos[title] ? videos[title] :
            base_path+this.currentTest.title+'/playlist.m3u8'
        hls.loadSource(video_url);
    });
    afterEach(function(){
        hls.observer.removeAllListeners();
        hls = null;
        video = null;

    });
    it('case1', function(done) {
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
            assert.equal(sc.state, 'ENDED', 'Wrong sc.state');
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
        assert.notEqual(sc.state, 'FRAG_LOADING', 'already loading');
        hls.on('hlsBufferAppending', on_data);
    });
    // reproduced with hls.js <= 0.6.1-31
    it('case2', function(done) {
        assert(hls, 'No Hls found');
        var sc = get_hls_sc(hls);
        var bc = get_hls_bc(hls);
        var orig_onMediaSourceEnded = bc.onMediaSourceEnded;
        bc.onMediaSourceEnded = function(){
            orig_onMediaSourceEnded.call(bc, arguments);
            assert.equal(sc.state, 'ENDED', 'Wrong sc.state');
            bc.onMediaSourceEnded = orig_onMediaSourceEnded;
            done();
        };
        hls.attachMedia(video);
        assert.notEqual(sc.state, 'FRAG_LOADING', 'already loading');
        hls.on('hlsFragParsingData', function(ev, data){
            try {
                assert.isNotNaN(data.startDTS, 'No startDTS found');
                assert.isNotNaN(data.endDTS, 'No endDTS found');
            } catch(e){ done(e); }
        });
    });
    // require Hola loader.js
    it('case3', function(done) {
        if (!window.hola_cdn)
            return this.skip('No hola_cdn found');
        assert(hls, 'No Hls found');
        var sc = get_hls_sc(hls);
        assert(window.hola_cdn.api, 'No hola_cdn.api!');
        var get_index = window.hola_cdn.api.hap_get_index;
        get_index = get_index.bind({dm: hls});
        assert(get_index, 'No hola_cdn.api.hap_get_index!')
        video.addEventListener('seeking', function(){
            var index = get_index({level_idx: 0}, video.currentTime, true);
            try { assert.equal(index, 2, 'Wrong index found'); }
            catch(e){ done(e); }
            done();
        });
        hls.attachMedia(video);
        assert.notEqual(sc.state, 'FRAG_LOADING', 'already loading');
        video.play();
        video.currentTime = 0.0003;
    });
    // reproduced with hls.js < 0.6.1-49
    it('case4', function(done) {
        assert(hls, 'No Hls found');
        var sc = get_hls_sc(hls);
        var bc = get_hls_bc(hls);
        var orig_onMediaSourceEnded = bc.onMediaSourceEnded;
        bc.onMediaSourceEnded = function(){
            orig_onMediaSourceEnded.call(bc, arguments);
            assert.equal(sc.state, 'ENDED', 'Wrong sc.state');
            bc.onMediaSourceEnded = orig_onMediaSourceEnded;
            done();
        };
        assert.notEqual(sc.state, 'FRAG_LOADING', 'already loading');
        hls.on('hlsError', function(event, err){
            try {
                // checks for possible different errors
                assert(err && err.details, 'Missing error data');
                assert.equal(err.details, 'fragLoopLoadingError',
                    'Not the test-case error');
                // at this point we have the test-case error loop
                assert(false, 'HLS fragment loop');
            }
            catch(e) { done(e); }
        });
        hls.attachMedia(video);
        function seek(){
            hls.off('hlsFragLoaded', seek);
            if (sc.state!='IDLE')
                return setTimeout(seek, 10);
            video.currentTime = 100;
        }
        hls.on('hlsFragLoaded', seek);
    });
});
