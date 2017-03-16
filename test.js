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
    var videos = {
        'case6': host+'/live?title=case6'
    };
    before(function(){
        if (window.Hls===undefined)
        {
            console.log('No hls.js found, skip all hls tests');
            this.skip();
            return;
        }
        assert(Hls.isSupported(), 'No HLS supported!');
    });
    beforeEach(function(){
        document.body.innerHTML = '<video id="video"></video>';
        video = document.getElementById('video');
        assert(video, 'No <video> element found');
        hls = new Hls({debug: false});
        assert(hls, 'No Hls found');
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
    function test_falsestart(){
        var sc = get_hls_sc(hls);
        assert.notEqual(sc.state, 'FRAG_LOADING', 'already loading'); }
    function test_ended(done){
        var sc = get_hls_sc(hls);
        var bc = get_hls_bc(hls);
        var orig_onMediaSourceEnded = bc.onMediaSourceEnded;
        bc.onMediaSourceEnded = function(){
            orig_onMediaSourceEnded.call(bc, arguments);
            assert.equal(sc.state, 'ENDED', 'Wrong sc.state');
            bc.onMediaSourceEnded = orig_onMediaSourceEnded;
            done();
        };
    }
    function test_DTS(done){
        hls.on('hlsFragParsingData', function(ev, data){
            try {
                assert.isNotNaN(data.startDTS, 'No startDTS found');
                assert.isNotNaN(data.endDTS, 'No endDTS found');
            } catch(e){ done(e); }
        });
    }
    function test_seek(pos, done){
        var sc = get_hls_sc(hls);
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
        function seek(){
            hls.off('hlsFragLoaded', seek);
            if (sc.state!='IDLE')
                return setTimeout(seek, 10);
            video.currentTime = pos;
        }
        hls.on('hlsFragLoaded', seek);
    }
    it('case1', function(done) {
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
        test_falsestart();
        hls.on('hlsBufferAppending', on_data);
    });
    // reproduced with hls.js < 0.6.1-36
    it('case2', function(done) {
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
        test_DTS(done);
    });
    // require Hola loader.js
    it('case3', function(done) {
        if (!window.hola_cdn)
            return this.skip('No hola_cdn found');
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
        test_falsestart();
        video.play();
        video.currentTime = 0.0003;
    });
    // reproduced with hls.js < 0.6.1-49
    it('case4', function(done) {
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
        test_seek(100, done);
    });
    // reproduced with hls.js < 0.6.1-37
    it('case5', function(done) {
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
        test_seek(160, done);
        test_DTS(done);
    });
    it.skip('case6', function(done) {
        this.timeout(0);
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
        test_DTS(done);
        video.play();
    });
    it('case7', function(done) {
        var seek = 169;
        test_ended(done);
        test_falsestart();
        hls.attachMedia(video);
        video.play();
        video.addEventListener('seeked', function(){
            assert(video.currentTime>=seek, 'Wrong seek position');
        });
        video.currentTime = seek;
    });
    it('case8', function(done) {
        var sc = get_hls_sc(hls);
        test_ended(done);
        test_falsestart();
        hls.attachMedia(video);
        video.play();
        var orig_onFragParsed = sc.onFragParsed;
        sc.onFragParsed = function(o){
            var frag = sc.fragCurrent;
            if (frag.sn==3)
            {
                try {
                    assert(o.lastGopPTS>=o.startPTS && o.lastGopPTS<=o.endPTS,
                        'Frag last GoP should be in start/end PTS range');
                } catch(e){ done(e); }
                done();
            }
            orig_onFragParsed.call(sc, o);
        };
    });
    it('case9', function(done) {
        var sc = get_hls_sc(hls);
        video.addEventListener('seeking', function(){
            if (video.currentTime>3)
                done();
        });
        var orig_onFragParsed = sc.onFragParsed;
        sc.onFragParsed = function(o){
            var frag = sc.fragCurrent;
            if (frag.sn==3)
                done('Seek over hole to next buffered data not occuered');
            orig_onFragParsed.call(sc, o);
        };
        video.currentTime = sc.lastCurrentTime = sc.startPosition = 2;
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
        test_DTS(done);
        video.play();
    });
    it('case10', function(done) {
        var sc = get_hls_sc(hls);
        hls.attachMedia(video);
        video.play();
        var orig_onFragParsed = sc.onFragParsed;
        sc.onFragParsed = function(o){
            var frag = sc.fragCurrent;
            orig_onFragParsed.call(sc, o);
            if (frag.sn==148648818)
            {
                try { assert(o.startPTS<o.endPTS, 'Frag startPTS < endPTS');
                } catch(e){ done(e); }
                done();
            }
        };
        test_DTS(done);
    });
    it('case11', function(done) {
        var sc = get_hls_sc(hls);
        hls.attachMedia(video);
        video.play();
        hls.on(Hls.Events.FRAG_STATISTICS, function(e, o){
            if (o.segment!=148648818)
                return;
            try { assert(!o.audioGap, 'Audio gap'); } catch(e){ done(e); }
            done();
        });
        test_DTS(done);
    });
    it('case12', function(done) {
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
        test_DTS(done);
        video.play();
    });
    it.skip('case13', function(done) {
        var audio_parsed, sc = get_hls_sc(hls);
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
        test_DTS(done);
        video.play();
        var orig_onFragParsingData = sc.onFragParsingData;
        sc.onFragParsingData = function(o){
            if (o.type=='audio')
                audio_parsed = true;
            orig_onFragParsingData.call(sc, o);
        };
        var orig_onFragParsed = sc.onFragParsed;
        sc.onFragParsed = function(o){
            if (!audio_parsed)
                done('Failed to parse mpeg audio');
            orig_onFragParsed.call(sc, o);
        };
    });
});

function fetch_data(url, range){
    var headers = new Headers();
    headers.append('Range', range);
    let size = 0;
    return fetch(url, {method: 'GET', headers: headers})
        .then(function(response){
            var range = response.headers.get('Content-Range');
            size = range.split('/')[1];
            return response.arrayBuffer();
        })
        .then(function(data){
            return {data: data, size: size}; });
}
function fetch_stream(url, size, on_data, on_end, pos){
    var chunk = 512*1024;
    let start = pos||0;
    let end = start+(start+chunk >= size ? size-pos : chunk)-1;
    return fetch_data(url, 'bytes='+start+'-'+end)
        .then(function(res){
            on_data(res.data);
            if (end+1==size)
                return;
            return fetch_stream(url, size, on_data, on_end, end+1);
        });
}
function get_stream(query, on_data, on_end, done){
    var url = host+'/stream?'+query;
    fetch_data(url, 'bytes=0-1')
    .then(function(res){
        return fetch_stream(url, res.size, on_data, on_end); })
    .then(on_end)
    .catch(done);
}

// https://github.com/hola/mux.js
describe('mux.js', function(){
    var video, transmuxer;
    before(function(){
        if (window.muxjs===undefined)
        {
            console.log('No mux.js found, skip all mux tests');
            this.skip();
            return;
        }
    });
    beforeEach(function(){
        assert(window.muxjs, 'No mux.js');
        var mp4 = window.muxjs.mp4;
        var mp2t = window.muxjs.mp2t;
        assert(mp4||mp2t, 'No muxjs.mp4||mp2t');
        transmuxer = mp4.Transmuxer||mp2t.Transmuxer;
        assert(transmuxer, 'No Transmuxer');
        document.body.innerHTML = '<video id="video"></video>';
        video = document.getElementById('video');
        assert(video, 'No <video> element found');
    });
    // fixed in: https://github.com/hola/mux.js/commit/a4ca2cf2d3cb2abab03c499445bb362fb1d3f6f5
    it('case_mux1', function(done){
        this.timeout(100000);
        var title = this.test.title;
        var parser_opt = {
            input_type: 'mp4',
            no_multi_init: true,
            no_combine: true
        };
        var parser = new transmuxer(parser_opt);
        var pending = [];
        var ended;
        var buffers = {};
        function on_open(){
            parser.on('data', function(packet){
                if (!packet.init)
                    return; //pending.push(packet);
                packet.inits.forEach(function(packet){
                    pending.push(packet); });
                apply_data();
            });
            parser.on('metadata', function(info){
                info.tracks.forEach(function(track){
                    var media_type = track.codec.startsWith('mp4a') ? 'audio' : 'video';
                    var mime = media_type+'/mp4; codecs="'+track.codec+'"';
                    var sbuf = buffers[track.id] = mse.addSourceBuffer(mime);
                });
            });
            get_stream('title='+title, function(data){
                parser.appendBuffer(data);
            }, function(){
                ended = true;
            }, done);
        }
        var apply_timeout;
        function apply_data(){
            if (apply_timeout)
            {
                clearTimeout(apply_timeout);
                apply_timeout = null;
            }
            if (!pending.length && ended)
                return done();
            if (!pending.length)
            {
                apply_timeout = setTimeout(apply_data, 200);
                return;
            }
            var block = pending[0];
            var sbuf = buffers[block.id];
            if (!sbuf||sbuf.updating)
            {
                apply_timeout = setTimeout(apply_data, 200);
                return;
            }
            var data = new Uint8Array(block.data||block.buffer);
            try {
                sbuf.appendBuffer(data);
                pending.shift();
                apply_data();
            }
            catch(e){
                if (e.name!='QuotaExceededError')
                    throw e;
                if (!apply_timeout)
                    apply_timeout = setTimeout(apply_data, 200);
            }
        }
        var mse = new window.MediaSource();
        if (mse.readyState=='open')
            return on_open();
        mse.addEventListener('sourceopen', on_open);
        var mse_url = window.URL.createObjectURL(mse);
        video.src = mse_url;
        video.addEventListener('error', function(e){
            throw video.error; });
    });
});
