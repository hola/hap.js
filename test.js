var base_path = '/base/test/';
document.body.innerHTML = '<video id="video"></video>';

function get_hls_sc(hls){
    return hls.streamController||hls.mediaController; }

function Uint8ToBase64(u8a){
    var CHUNK_SZ = 0x8000;
    var c = [];
    for (var i=0; i < u8a.length; i+=CHUNK_SZ)
        c.push(String.fromCharCode.apply(null, u8a.subarray(i, i+CHUNK_SZ)));
    return btoa(c.join(''));
}

function Base64ToUint8(str){
    return new Uint8Array(atob(b64encoded).split('').map(function(c){
        return c.charCodeAt(0); }));
}

function compare(hls, segment, done){
    segment = base_path+segment;
    hls.on('hlsBufferAppending', function on_data(e, data){
        assert(data, 'no data appending');

        fetch('http://localhost:3000/save_output?track='+data.type, {
            method: 'POST',
            body: data.data.buffer
        });

        //done();
    });
    fetch(segment).then(function(response){
        assert.equal(response.status, 200, 'cant fetch segment');
        return response.arrayBuffer();
    }).then(function(buffer) {
        var sc = get_hls_sc(hls);
        sc.state = 'FRAG_LOADING';
        sc.fragCurrent = {level: 0, sn: 0};
        var event = {payload: buffer, frag: sc.fragCurrent, stats: {}};
        event.payload.first = true;
        hls.trigger('hlsFragChunkLoaded', event);
    }).catch(done);
}

describe('get video element', function(){
    it('video element exist', function () {
        var video = document.getElementById('video');
        assert(video, 'no video element found');
    });
});

describe('hls.js', function(){
    var hls;
    var test_video = base_path+'bipbop/prog_index_custom.m3u8';
    before(function(done){
        var video = document.getElementById('video');
        hls = new Hls({debug: true});
        hls.on(Hls.Events.MEDIA_ATTACHED, function media_cb(){
            hls.off(Hls.Events.MEDIA_ATTACHED, media_cb);
            hls.loadSource(test_video);
            hls.on(Hls.Events.MANIFEST_PARSED, function cb(){
                hls.off(Hls.Events.MANIFEST_PARSED, cb);
                hls.fragmentLoader.prev_onFragLoading = hls.fragmentLoader.onFragLoading;
                hls.abrController.prev_clearTimer = hls.abrController.clearTimer;
                hls.abrController.prev_clearTimer();
                hls.fragmentLoader.onFragLoading = hls.abrController.clearTimer = function(){};
                hls.abrController.timer = 1;
                hls.levelController.manualLevel = hls.loadLevel===undefined ? -1 : hls.loadLevel;
                hls.config.saved_maxBuferHole = hls.config.maxBufferHole;
                hls.config.maxBufferHole = 0.5;
                done();
            });
        });
        hls.attachMedia(video);
    });

    it('load chunk', function(done) {
        this.timeout(5000);
        var segment = 'bipbop/segment0.ts';
        var sc = get_hls_sc(hls);
        if (sc.state == 'FRAG_LOADING')
            compare(hls, segment, done);
        else
        {
            hls.on('hlsFragLoading', function on_frag_loading(e, data){
                var frag = data.frag;
                hls.frag = frag;
                hls.frag.loaded = 0;
                hls.off('hlsFragLoading', on_frag_loading);
                compare(hls, segment, done);
            });
        }
    });
});
