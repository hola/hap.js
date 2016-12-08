var host = 'http://localhost:3000';
var base_path = '/base/test/';
document.body.innerHTML = '<video id="video"></video>';

function get_hls_sc(hls){
    return hls.streamController||hls.mediaController; }
function get_hls_bc(hls){
    return hls.bufferController; }

function concat_arrays(a, b) {
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

describe('get video element', function(){
    it('video element exist', function () {
        var video = document.getElementById('video');
        assert(video, 'no video element found');
    });
});

describe('hls.js', function(){
    var video, hls;
    var test_video = base_path+'bipbop/case1.m3u8';

    before(function(){
        assert(Hls.isSupported(), 'No HLS supported!');
        video = document.getElementById('video');
        assert(video, 'No <video> element found');
    });

    beforeEach(function(){
        hls = new Hls({debug: true});
        hls.loadSource(test_video);
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
            Promise.all(pending).then(function(){ done(); })
            .catch(function(err){ done(err); });
        };
        hls.attachMedia(video);
        assert(sc.state!='FRAG_LOADING', 'already loading');
        hls.on('hlsBufferAppending', on_data);
    });
});
