var host = 'http://localhost:3000';
var base_path = '/base/test/';
var release_mode = (__karma__.config.args||[]).includes('release');
// fix possible bugs when setTimeout executed after test ended
function init_timeouts(){
    var timeouts = [];
    var set_timeout = function(){
        var id = setTimeout.apply(this, arguments);
        timeouts.push(id);
        return id;
    }
    set_timeout.clean = function(){
        timeouts.forEach(function(id){
            clearTimeout(id); });
        timeouts = [];
    }
    return set_timeout;
}
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
        assert(false, json.text+', reason: '+json.data);
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
    var setTimeout = init_timeouts();
    var video, hls;
    var videos = {};
    before(function(){
        if (release_mode)
        {
            console.log('release mode, skipping hls.js tests');
            this.skip();
            return;
        }
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
            base_path+this.currentTest.title+'/playlist.m3u8';
        hls.loadSource(video_url);
    });
    afterEach(function(){
        setTimeout.clean();
        hls.observer.removeAllListeners();
        hls = null;
        video = null;
    });
    function test_falsestart(){
        var sc = get_hls_sc(hls);
        assert.notEqual(sc.state, 'FRAG_LOADING', 'already loading');
    }
    function test_ended(done){
        function wait(){
            if (sc.state=='IDLE')
                return setTimeout(wait, 100);
            assert.equal(sc.state, 'ENDED', 'Wrong sc.state');
            bc.onMediaSourceEnded = orig_onMediaSourceEnded;
            done();
        }
        var sc = get_hls_sc(hls);
        var bc = get_hls_bc(hls);
        var orig_onMediaSourceEnded = bc.onMediaSourceEnded;
        bc.onMediaSourceEnded = function(){
            orig_onMediaSourceEnded.call(bc, arguments);
            wait();
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
    // XXX alexeym: simplify parse_serve_log
    function parse_serve_log(log){
        var prev;
        var loaded = [];
        var events = [];
        var start_pos;
        var max_level = 0;
        var level = '#EXTM3U\n';
        var current_level;
        log.forEach(function(item){
            var manifest = '';
            if (current_level===undefined || item.qid!=current_level)
            {
                current_level = item.qid;
                if (max_level<item.qid)
                    max_level = item.qid;
                events.push({type: 'switch', from: Math.floor(item.pos),
                    to: item.qid});
            }
            if (!item.url)
            {
                if (item.msg=='stream start' && item.to!=-1)
                {
                    // XXX alexeym: fix missed segments duration to be precise
                    events.push({type: 'seek', from: Math.floor(prev.pos),
                        to: item.pos});
                    var new_index = item.from;
                    var start_index = prev.index+(prev.url ? 1 : 0);
                    for (var i=start_index;i<new_index;i+=1)
                    {
                        manifest += '#EXTINF:'+(prev.dur||8)+',\n';
                        manifest += host+'/dummy?index='+i+'\n';
                        loaded.push(i);
                    }
                    prev = {index: item.from, dur: prev.dur, pos: item.pos};
                }
                level += manifest;
                return;
            }
            // XXX alexeym: find why duplicated indexes could happens
            if (item.index && loaded.indexOf(item.index)>-1)
                return;
            // XXX alexeym: hack to handle serve_logs which are not
            // from the video start; find a better way
            if (item.buffer&&start_pos===undefined)
                start_pos = item.pos+item.buffer+item.dur;
            events.push({type: 'segment', from: Math.floor(item.pos),
                index: item.index});
            prev = item;
            manifest += '#EXTINF:'+(item.dur||8)+',\n';
            manifest += item.url+'\n';
            loaded.push(item.index);
            level += manifest;
            return;
        });
        level += '#EXT-X-ENDLIST';
        var manifest = '#EXTM3U\n';
        for (var qid=0; qid<=max_level; qid+=1)
        {
            manifest += '#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH='+(qid)+'\n';
            manifest += 'data:application/x-mpegurl;base64,'+btoa(level)+'\n';
        }
        return {manifest: 'data:application/x-mpegurl;base64,'+btoa(manifest),
            events: events, start_pos: start_pos};
    }
    var serve_log = []; // Replace with Serve Log data array to launch the test
    if (serve_log.length)
    {
        var parsed_log = parse_serve_log(serve_log);
        videos.serve_log = parsed_log.manifest;
        it.only('serve_log', function(done){
            this.timeout(0);
            var sc = get_hls_sc(hls);
            var orig_tick = sc._doTickIdle.bind(sc);
            var count = parsed_log.events.length;
            function step(){
                var step = count-parsed_log.events.length;
                return '('+step+'/'+count+'): ';
            }
            console.log(step()+'Serve log test, '+count+' events');
            var event = parsed_log.events.shift();
            var current_level = event.type=='switch' ? event.to : 0;
            // handle seeking events and feed the segments in proper timings
            sc._doTickIdle = function(){
                if (!event)
                    return orig_tick();
                var test_time = +video.currentTime+parsed_log.start_pos;
                // XXX alexeym: useful for serve_log debug
                if (0)
                console.log('Time:'+test_time, event.type, event.from);
                if (test_time&&test_time<event.from)
                    return true;
                hls.nextLoadLevel = current_level;
                switch (event.type){
                case 'segment':
                    console.log(step()+'Feed segment #'+event.index,
                        'qid: '+current_level);
                    event = parsed_log.events.shift();
                    return orig_tick();
                case 'seek':
                    console.log(step()+'Seek to '+event.to);
                    var to = event.to;
                    event = parsed_log.events.shift();
                    video.currentTime = to;
                    break;
                case 'switch':
                    console.log(step()+'Switch quality to '+event.to);
                    current_level = event.to;
                    event = parsed_log.events.shift();
                    break;
                }
                return true;
            };
            hls.startLevel = current_level;
            test_ended(done);
            hls.attachMedia(video);
            test_falsestart();
            test_DTS(done);
            video.volume = 0;
            video.play();
        });
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
    // reproduced with hls.js < 0.6.1-51
    // XXX alexeym: sometimes test passed even for broken version
    it('case6', function(done) {
        var segment_duration = 4000;
        var playback_time = segment_duration*2;
        var timeout_id;
        this.timeout(playback_time+2000);
        test_ended(done);
        hls.on('hlsMediaAttached', function(){
            hls.nextLevel = 0;
            setTimeout(function(){
                hls.currentLevel = 1;
            }, playback_time-1000);
            check_duration(video.duration);
            setTimeout(function(){
                if (timeout_id)
                    clearTimeout(timeout_id);
                done();
            }, playback_time+1000);
        });
        hls.startLevel = 0;
        hls.autoLevelEnabled = false;
        hls.attachMedia(video);
        test_falsestart();
        test_DTS(done);
        video.play();
        function check_duration(duration){
            var current = video.duration;
            if (duration&&current)
                assert(current>=duration, 'duration glitch');
            timeout_id = setTimeout(check_duration, 500, current);
        }
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
    it('case13', function(done) {
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
    it('case14', function(done) {
        var sc = get_hls_sc(hls), seek = 49, pts = 43.091;
        test_ended(done);
        hls.attachMedia(video);
        video.play();
        video.currentTime = seek;
        var orig_onFragParsingData = sc.onFragParsingData;
        sc.onFragParsingData = function(o){
            var frag = sc.fragCurrent;
            if (o.type=='audio' && frag.sn==5)
            {
                if (o.startPTS.toFixed(3)!=pts || o.startDTS.toFixed(3)!=pts)
                {
                    done('unexpected PTS for parsed audio, exp:'+pts+' got: '+
                        o.startPTS);
                }
                done();
            }
            orig_onFragParsingData.call(sc, o);
        };
    });
    it('case15', function(done) {
        var sc = get_hls_sc(hls), seek = 49, start = 43.210, end = 53.136;
        test_ended(done);
        hls.attachMedia(video);
        video.play();
        video.currentTime = seek;
        var orig_onFragParsingData = sc.onFragParsingData;
        sc.onFragParsingData = function(o){
            var frag = sc.fragCurrent;
            if (o.type=='video' && frag.sn==5)
            {
                if (o.startPTS.toFixed(3)!=start || o.endPTS.toFixed(3)!=end)
                {
                    done('unexpected PTS for parsed video, exp:['+start+','+
                        end+'] got:['+o.startPTS+':'+o.endPTS+']');
                }
                done();
            }
            orig_onFragParsingData.call(sc, o);
        };
    });
    it('case16', function(done) {
        var sc = get_hls_sc(hls);
        hls.on(Hls.Events.MANIFEST_PARSED, function(e, o){
            done(o.levels.length!=3 ? 'manifest parsing error' : undefined);
        });
    });
    it('case17', function(done) {
        var sc = get_hls_sc(hls);
        video.currentTime = sc.lastCurrentTime = sc.startPosition = 20;
        video.play();
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
    });
    it('case18', function(done) {
        video.play();
        test_ended(done);
        hls.attachMedia(video);
        test_falsestart();
    });
    it('case19', function(done) {
        var sc = get_hls_sc(hls);
        hls.levelController.level = 1;
        hls.attachMedia(video);
        test_falsestart();
        video.play();
        var orig_onFragLoaded = sc.onFragLoaded;
        sc.onFragLoaded = function(o){
            var frag = sc.fragCurrent;
            if (frag.sn==15354)
            {
                hls.levelController.level = 0;
                hls.levelController.manualLevel = 0;
                //sc.fragTimeOffset = ;
            }
            orig_onFragLoaded.call(sc, o);
        };
        var orig_onFragParsingData = sc.onFragParsingData;
        sc.onFragParsingData = function(o){
            var frag = sc.fragCurrent;
            if (o.type=='video' && frag.sn==15355)
            {
                if (o.endPTS<o.startPTS)
                    done('negative duration for parsed video sn:'+frag.sn);
                done();
            }
            orig_onFragParsingData.call(sc, o);
        };
    });
});

function fnv1a(chunk){
    var hash = 2166136261, arr = new Uint8Array(chunk);
    for (var i=0; i<arr.length; i++)
        hash = (hash^arr[i])*16777619>>>0;
    return hash;
}

function fetch_data(url, range, checksum){
    var headers = new Headers();
    headers.append('Range', range);
    var size = 0;
    return fetch(url, {method: 'GET', headers: headers})
        .then(function(response){
            var range = response.headers.get('Content-Range');
            size = range.split('/')[1];
            return response.arrayBuffer();
        })
        .then(function(data){
            var res = {data: data, size: size};
            if (checksum)
                res.checksum = fnv1a(data);
            return res;
        });
}
function fetch_stream(url, size, on_data, on_end, pos, range){
    var chunk, start, end;
    var info = range ? range.shift() : undefined;
    if (info)
    {
        start = info.pos;
        end = info.pos+info.len-1;
    }
    else
    {
        chunk = 512*1024;
        start = pos||0;
        end = start+(start+chunk >= size ? size-pos : chunk)-1;
    }
    return fetch_data(url, 'bytes='+start+'-'+end, !!range)
        .then(function(res){
            on_data(res.data);
            if (end+1==size)
                return;
            return fetch_stream(url, size, on_data, on_end, end+1, range);
        });
}

function get_stream(query, on_data, on_end, done, range){
    var url = host+'/stream?'+query;
    fetch_data(url, 'bytes=0-1')
    .then(function(res){
        return fetch_stream(url, res.size, on_data, on_end, undefined, range); })
    .then(on_end)
    .catch(done);
}

// https://github.com/hola/mux.js
describe('mux.js', function(){
    var transmuxer;
    var parsers = [];
    var parser_opt = {
        input_type: 'mp4',
        no_multi_init: true,
        no_combine: true
    };
    var setTimeout = init_timeouts();
    before(function(){
        if (release_mode)
        {
            console.log('release mode, skipping mux.js tests');
            this.skip();
            return;
        }
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
    });
    afterEach(function(){
        setTimeout.clean();
        parsers.forEach(function(p){
            p.dispose(); });
        parsers = [];
    });
    function init_parser(opt){
        opt = opt||{};
        var parser = new transmuxer(parser_opt);
        parsers.push(parser);
        if (opt.on_metadata)
            parser.on('metadata', opt.on_metadata);
        if (opt.on_data)
            parser.on('data', opt.on_data);
        get_stream('title='+opt.title, function(data){
            parser.appendBuffer(data);
        }, opt.on_ended, opt.done, opt.range);
        return parser;
    }
    function init_mse(on_open){
        document.body.innerHTML = '<video id="video"></video>';
        var video = document.getElementById('video');
        assert(video, 'No <video> element found');
        var mse = new window.MediaSource();
        if (mse.readyState=='open')
            return on_open();
        mse.addEventListener('sourceopen', on_open);
        var mse_url = window.URL.createObjectURL(mse);
        video.src = mse_url;
        video.addEventListener('error', function(e){
            assert.isNotOk(video.error, 'Should be no errors'); });
        return mse;
    }
    // fixed in 1.0.0-16
    // https://github.com/hola/mux.js/commit/a4ca2cf2d3cb2abab03c499445bb362fb1d3f6f5
    it('case_mux1', function(done){
        var pending = [];
        var ended;
        var buffers = {};
        function on_metadata(info){
            info.tracks.forEach(function(track){
                var media_type = track.codec.startsWith('mp4a') ?
                    'audio' : 'video';
                var mime = media_type+'/mp4; codecs="'+track.codec+'"';
                buffers[track.id] = mse.addSourceBuffer(mime);
            });
        }
        function on_data(packet){
            if (!packet.init)
                return; //pending.push(packet);
            packet.inits.forEach(function(packet){
                pending.push(packet); });
            apply_data();
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
        function on_ended(){
            ended = true; }
        var title = this.test.title;
        var mse = init_mse(function(){
            init_parser({title: title, done: done, on_metadata: on_metadata,
                on_data: on_data, on_ended: function(){ ended = true; }});
        });
    });
    // fixed in 1.0.0-15
    // https://github.com/hola/mux.js/commit/78067c99489e4d132091dff40e8dd7b4c2f46af8
    it('case_mux2', function(done){
        function on_metadata(info){
            info.tracks.forEach(function(track){
                if (!track.codec.startsWith('mp4a'))
                    return;
                assert.equal(track.codec, 'mp4a.40.5');
                done();
            });
            assert(false, 'The test should be completed on this step');
        };
        init_parser({title: this.test.title, done: done,
            on_metadata: on_metadata});
    });
    // fixed in 1.0.0-12
    // https://github.com/hola/mux.js/commit/9a3948a700dcc5a44b422c2725a338f130ea8be5
    it('case_mux3', function(done){
        var samplerate;
        var audio_track;
        function on_metadata(info){
            info.tracks.forEach(function(track){
                if (!track.codec.startsWith('mp4a'))
                    return;
                audio_track = track;
                assert.equal(track.samplerate, 90000);
                samplerate = track.samplerate;
            });
        };
        function on_data(data){
            if (!data.inits)
                assert(false, 'The test should be completed on this step');
            assert.equal(audio_track.samplerate, 90000,
                'Wrong audio sample rate');
            done();
        };
        init_parser({title: this.test.title, done: done,
            on_metadata: on_metadata, on_data: on_data});
    });
});

describe('basics', function(){
    before(function(){
        if (window.Hls===undefined)
            assert.fail(0, 1, 'No hls.js found, unable to run tests');
    });
    var setTimeout = init_timeouts();
    var video, hls;
    beforeEach(function(){
        document.body.innerHTML = '<video id="video"></video>';
        video = document.getElementById('video');
        assert(video, 'No <video> element found');
        hls = new Hls({debug: false});
        assert(hls, 'No Hls found');
    });
    afterEach(function(){
        setTimeout.clean();
        hls.observer.removeAllListeners();
        hls = null;
        video = null;
    });
    it.skip('hls.js works', function(done){
        hls.on(Hls.Events.MEDIA_ATTACHED, function(){
            hls.loadSource(base_path+'basics/playlist.m3u8');
        });
        hls.on(Hls.Events.MANIFEST_PARSED, function(){
            video.play();
            setTimeout(check_video_playing, 500);
        });
        function check_video_playing(){
            expect(video.currentTime).above(0);
            done();
        }
        hls.attachMedia(video);
    });
});
