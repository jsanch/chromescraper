require.config({
    paths: {
        text: chrome.extension.getURL('libs/text'),
        jquery: chrome.extension.getURL('libs/jquery-2.1.4'),
        draggabilly: chrome.extension.getURL('libs/draggabilly.pkgd')
    }
});


// require the require function
requirejs( [ 'require', 'jquery', 'draggabilly' ],
    function( require, $, Draggabilly ) {
    // require jquery-bridget, it's included in draggabilly.pkgd.js
    require( [ 'jquery-bridget/jquery.bridget' ],
        function() {
            // make Draggabilly a jQuery plugin
            $.bridget( 'draggabilly', Draggabilly );
            // everything set up, lets start the actual script
            ini();
        }
    );
});