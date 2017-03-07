'use strict';
var _ = require('lodash');
module.exports = function(grunt) {
    var config = {
        pkg: grunt.file.readJSON('package.json'),
        clean: {dist: ['dist/*']},
        browserify: {},
        exorcise: {},
        uglify: {options: {sourceMap: true}},
    };
    _.forEach({
        hls: {
            file: 'hola_hls',
            standalone: 'Hls',
        },
        videojs: {
            file: 'hola_videojs_hls',
            standalone: 'hola_videojs_hls',
            provider: '@hola.org/videojs5-hlsjs-source-handler',
        },
        flowplayer: {
            file: 'hola_flowplayer_hls',
            standalone: 'hola_flowplayer_hls',
            provider: '@hola.org/flowplayer-hlsjs',
        },
        jwplayer: {
            file: 'hola_jwplayer_hls',
            standalone: 'hola_jwplayer_hls',
            provider: '@hola.org/jwplayer-hlsjs',
        }
    }, function(v, k){
        var src;
        var dst = 'dist/'+v.file+'.js';
        var dst_map = 'dist/'+v.file+'.js.map';
        var dst_min = 'dist/'+v.file+'.min.js';
        if (v.provider)
        {
            src = 'temp/'+v.file+'.js';
            grunt.file.write(src,
                grunt.file.read('src/hola_provider_hls.js')
                .replace('_PROVIDER_', v.provider));
        }
        else
            src = 'src/'+v.file+'.js';
        config.browserify[k] = {
            files: {},
            options: {
                browserifyOptions: {standalone: v.standalone, debug: true},
            },
        };
        config.browserify[k].files[dst] = [src];
        config.exorcise[k] = {files: {}};
        config.exorcise[k].files[dst_map] = [dst];
        config.uglify[k] = {options: {sourceMapIn: dst_map}, files: {}};
        config.uglify[k].files[dst_min] = dst;
    });
    grunt.initConfig(config);
    require('load-grunt-tasks')(grunt);
    grunt.registerTask('build', ['clean', 'browserify', 'exorcise', 'uglify']);
    grunt.registerTask('default', ['build']);
};
