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
        },
        flowplayer: {
            file: 'hola_flowplayer_hls',
            standalone: 'hola_flowplayer_hls',
        },
        jwplayer: {
            file: 'hola_jwplayer_hls',
            standalone: 'hola_jwplayer_hls',
        }
    }, function(v, k){
        var src = 'src/'+v.file+'.js';
        var dst = 'dist/'+v.file+'.js';
        var dst_map = 'dist/'+v.file+'.js.map';
        var dst_min = 'dist/'+v.file+'.min.js';
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
