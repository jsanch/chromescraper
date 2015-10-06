/*! The MIT License (MIT)

 * Copyright (c) 2015 Ivan Castellanos

 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/* global chrome, console */

chrome.contextMenus.create({'title': 'Chromescrap this!', 'contexts':['page', 'link', 'image', 'video', 'audio'], 'onclick': function (obj, tab) {
    chrome.tabs.sendMessage(tab.id, 'start-chromescrap-selection');
}});

chrome.runtime.onMessage.addListener(function (request) {
    if (request.rows) {
        console.log(request.rows);
        createGoogleSheet(request.rows, request.title);
    }
});


// takes 2D array, e.g
//     array = [[1,2,3,4,5],['death','come','for','my','devil']]
function createGoogleSheet(array, title) {

    'use strict';

    var csv = array.reduce(function (prev, curr) {
        // dealing with empty rows
        if (curr.join('') === '') {
            return prev;
        }
        return prev + curr.reduce(function (prev, cell) {
            cell = cell ? cell.toString().trim() : '';
            if (/,|\n|"/.test(cell)) {
                cell = '"' + cell.replace(/"/g, '""') + '"';
            }
            return prev + cell + ',';
        }, '') + '\r\n';
    }, '');

    chrome.identity.getAuthToken({interactive: true}, function (token) {
        console.log(' I got the token! ' + token);

        var contentType = 'text/csv';
        var blob = new Blob([csv], {type: contentType});

        var boundary = '-------314159265358979323846';
        var delimiter = '\r\n--' + boundary + '\r\n';
        var close_delim = '\r\n--' + boundary + '--';

        var reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = function () {

            var metadata = {
              'title': title || 'Untitled',
              'mimeType': contentType
            };

            var base64Data = btoa(reader.result);
            console.log(base64Data);
            var multipartRequestBody =
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: ' + contentType + '\r\n' +
                '\r\n' +
                csv +
                close_delim;

            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&convert=true', true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token); // token comes from chrome.identity
            xhr.setRequestHeader('Content-Type', 'multipart/mixed; boundary=' + boundary);
            xhr.onload = function() { 
                console.log(xhr.responseText);
                var data = JSON.parse(xhr.responseText);
                chrome.tabs.create({url: data.alternateLink}, function () {
                    chrome.storage.sync.get(['shown_interval'], function (items) {
                        var oneWeek = 1000 * 60 * 60 * 24 * 7;
                        if (!items.shown_interval || Date.now() - items.shown_interval > oneWeek) {
                            chrome.windows.create({url: 'popup.html', type: 'popup', width: 430, height: 270, focused: true, top: 230, left: 46});
                            chrome.storage.sync.set({'shown_interval': Date.now()});
                        }
                    });
                });
            };
            xhr.onerror = function() { console.log(arguments); };
            xhr.send(multipartRequestBody);
        };
    });

}

// createGoogleSheet(['nice', 'day'], ['to', 'die']);