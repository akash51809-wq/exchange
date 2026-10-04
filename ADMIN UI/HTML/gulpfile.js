var gulp = require('gulp');
sass = require("gulp-sass"),
postcss = require("gulp-postcss");
autoprefixer = require("autoprefixer");
var sourcemaps = require('gulp-sourcemaps'); 
var browserSync = require('browser-sync').create(); 
cssbeautify = require('gulp-cssbeautify');
var beautify = require('gulp-beautify');



/*******************  LTR   ******************/


//_______ task for scss folder to css main style 
gulp.task('watch', function() {
	console.log('Command executed successfully compiling SCSS in assets.');
	 return gulp.src('zendash/assets/scss/**/*.scss') 
		.pipe(sourcemaps.init())                       
		.pipe(sass())
		.pipe(sourcemaps.write(''))   
		.pipe(gulp.dest('zendash/assets/css'))
		.pipe(browserSync.reload({
		  stream: true
	}))
})

//_______task for dark
gulp.task('dark', function(){
   return gulp.src('zendash/assets/css/dark.scss')
        .pipe(sourcemaps.init())
        .pipe(sass())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('zendash/assets/css'));
		
})

//_______task for sidemenu
gulp.task('menu', function(){
   return gulp.src('zendash/assets/css/sidemenu.scss')
        .pipe(sourcemaps.init())
        .pipe(sass())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('zendash/assets/css'));
		
})


//_______task for skins
gulp.task('skins', function(){
   return gulp.src('zendash/assets/css/skins.scss')
        .pipe(sourcemaps.init())
        .pipe(sass())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('zendash/assets/css'));
		
})



/*******************  LTR-Beautify  ******************/

//_______ task for beautifying css
gulp.task('beautify', function() {
    return gulp.src('zendash/assets/css/*.css')
        .pipe(beautify.css({ indent_size: 4 }))
        .pipe(gulp.dest('zendash/assets/css'));
});



