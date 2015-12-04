var gulp    = require('gulp');
var connect = require('gulp-connect');
var uglify  = require('gulp-uglify');

gulp.task('default', function() {
    connect.server({
        port: 3005,
        root: '.',
        host: 'localhost'
    });
});
