// Karma configuration
// Generated on Wed Oct 26 2016 13:35:40 GMT+0300 (MSK)

const fs = require('fs');

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha', 'chai', 'express-http-server'],

    // list of files / patterns to load in the browser
    files: [
      '*.js',
      'stack/hls.js',
      //'stack/hls-0.6.6.js',
      //{pattern: 'stack/*.js'},
      {pattern: 'test/*', included: false},
      {pattern: 'test/bipbop/*', included: false},
    ],

    // list of files to exclude
    exclude: [],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      //'*.html': ['html2js'],
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress'],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: [
        'Chrome',
    //    'Firefox'
    ],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity,

    expressHttpServer: {
        port: 3000,
        appVisitor: function (app, log) {
            let index = 0;
            app.post('/save_output', function(req, res){
                let data = '';
                let type = req.query.track;
                let file_index = index;
                index += 1;
                req.on('data', function(chunk){ data += chunk; });
                req.on('end', function(){
                    fs.writeFile('output_'+type+file_index+'.mp4', data, 'binary');
                    res.status(200).send('OK');
                });
            });
        },
    },
  })
}
