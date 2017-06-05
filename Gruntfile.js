'use strict';
var _ = require('lodash');
module.exports = function(grunt) {
    var pkg = grunt.file.readJSON('package.json');
    var config = {
        pkg: pkg,
        clean: {dist: ['dist/*']},
        browserify: {},
        exorcise: {},
        uglify: {options: {sourceMap: true}},
        karma: {unit: {configFile: 'hap.conf.js'}, release: {
            configFile: 'hap.conf.js'}},
        copy: {
            lib: {expand: true, cwd: 'src/', dest: 'lib/',
                src: ['conf.js', 'zdot_conf.js', 'external_util.js']},
            test: {files: [{src: 'dist/hola_hls.js', dest: 'stack/hls.js'},
                {src: 'dist/hola_mux.js', dest: 'stack/mux.js'}]},
        },
    };
    _.forEach({
        hls: {
            file: 'hola_hls',
            standalone: 'Hls',
        },
        mux: {
            file: 'hola_mux',
            standalone: 'muxjs',
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
            src = 'lib/'+v.file+'.js';
            grunt.file.write(src,
                grunt.file.read('src/hola_provider_hls.js')
                .replace('__PROVIDER__', v.provider)
                .replace('__VERSION__', pkg.version)
                .replace('__SCRIPTID__', v.file+'_provider'));
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
    grunt.registerTask('build', ['clean', 'copy:lib', 'browserify', 'exorcise',
        'uglify']);
    grunt.registerTask('test', ['build', 'copy:test', 'karma:unit']);
    grunt.registerTask('release', ['build']);
    grunt.registerTask('default', ['build']);
};
