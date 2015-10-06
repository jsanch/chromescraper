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


/* global require, chrome, console */
/* exported ini */

var dependencies = [
    'text!' + chrome.extension.getURL('snippets/chrome_scrap_container_css'),
    'text!' + chrome.extension.getURL('snippets/chrome_scrap_container_html'),
    chrome.extension.getURL('utils.js'),
    'jquery',
    'draggabilly'
];


var ini = require.bind(require, dependencies, function(container_css, container_html, utils, $) {

    'use strict';

    var toArray = utils.toArray;
    var get = utils.get;
    var getAll = utils.getAll;
    var text = utils.text;
    const NO_CHILDREN_OF = 'a';
    const DEBUG = false;

    // Initially we need to save the element
    // where the right-click happened
    var clickedEl = null;
    document.addEventListener('mousedown', function(event) {
        if (event.button === 2) { 
            clickedEl = event.target;
        }
    }, true);

    chrome.extension.onMessage.addListener(function(request) {
        if (request === 'start-chromescrap-selection' && clickedEl.parentElement) {

            /*
             * 0) DELETE PREVIOUS INSTANCE IF EXISTS 
             *    AND SET UP EVENT-ABLE OBJECT $data
             */
            terminate();
            var $data = $({});
            $data.clickedEl = clickedEl;

            /*
             * 1) SELECT CONTAINER
             * new data: {container, curr_selector}
             */
            step1($data);

            /*
             * 2) FUZZY SEARCH SIBLINGS
             * new data: {all_matched_groups}
             */
            $data.on('step2', step2.bind(null, $data));

            /*
             * 3) CONSTRUCT ROWS OF DATA
             * new data: {rows} 
             */
            $data.on('step3', step3.bind(null, $data));

            /*
             * 4) SEND ROWS TO CHROMESCRAP.JS
             * new data: {} 
             */
            $data.on('step4', step4.bind(null, $data));

        }
    });

    var step1 = function ($data) {

        var container = createShadowDOM($data);
        var curr_selector = '';
        var $range = $('#range', container);
        var helper = get('.selection_helper', container);
        var parts_selector;
        var markRequestedWithRed = function () {
            if ($(curr_selector).length === 0) {
                // lets split selector into parts, example of result:
                // ["body", " > ", "center:nth-child(1)", " > ", "table:nth-child(1)"]
                parts_selector = utils.getSelector($data.clickedEl).split(/( > )/);
                $range.prop({max: (parts_selector.length + 1) / 2, min: 1, value: 1});
            }
            var reduce = ($range.val() - 1) * 2;
            curr_selector = parts_selector.slice(0, parts_selector.length - reduce).join('');
            helper.style.cssText = getHelperCSS(get(curr_selector).getBoundingClientRect());
        };
        markRequestedWithRed();
        $range.on('input', markRequestedWithRed);
        $('#form1', container).on('submit', function (event) {
            event.preventDefault();
            $data.container = container;
            $data.curr_selector = curr_selector;
            $data.trigger('step2');
        });
    };

    var step2 = function ($data) {

        var curr_selector = $data.curr_selector;
        var container = $data.container;
        var allmatchedgroups = [];
        var ele =          get(curr_selector);
        var form =         get('#form1', container);
        var opts =         get('ul#options_list', container);
        var addSiblings =  get('input.addSiblings', opts);
        var matchRegex =   get('input.matchRegex', opts);
        var ignoreCase =   get('input.ci', opts);
        var matchHTML =    get('input.matchHTML', opts);
        var finishBtn =    get('input.finish', opts);
        var trim =         get('input.trim', opts);
        var hierarchy = [];

        var curr = ele;
        while (curr && curr.tagName !== 'BODY') {
            if (hierarchy.length > 5) {
                break;
            }
            hierarchy.unshift({
                name: curr.tagName.toLowerCase(),
                classes: toArray(curr.classList)
            });
            curr = curr.parentElement;
        }

        $(opts).css({display: 'inline-block', left: form.style.left, top: form.style.top});
        form.remove();

        hierarchy.forEach(function (tag, rowIndex) {
            var $li = $('<li>').attr('data-key', rowIndex);
            var id = 'cb' + rowIndex;
            var checked = utils.isLastItem(hierarchy, tag) ? ' checked ' : '';
            var html = `<input class="active" id="${id}" type="checkbox" ${checked}/><label for="${id}">${tag.name}</label>`;
            
            html += '<ul class="classesList">';
            html += tag.classes.map(function (classname, index) {
                var id = 'cl' + rowIndex + '-' + index;
                var checked = (utils.isLastItem(hierarchy, tag) && index < 3) ? ' checked ' : '';
                return `<li>
                        <input id="${id}" class="cl" ${checked} type="checkbox" name="${classname}" />
                        <label for="${id}">${classname}</label> 
                        </li>`;
            }).join('');
            html += '</ul>';

            $li.html( html );
            $('.extra-options', opts).before($li);

        });
    

        // mark elements based on user choise (css classes, siblings, etc) 
        var render = function (e, firstTime) {

            if (e && e.stopPropagation) {
                e.stopPropagation();
            }

            // If first time make sure active classes match the requested element
            if (firstTime === true) {
                let temp_selector = '';
                let hierarchyCopy = hierarchy.slice();
                let requested = get(curr_selector);
                while (hierarchyCopy.length) {
                    if (temp_selector && getAll(temp_selector).indexOf(requested) !== -1) {
                        let matchesChild = getAll('*', requested).some(function (ele) {
                            return getAll(temp_selector).indexOf(ele) !== -1;
                        });
                        if (!matchesChild) {
                            // requested element found, and selector doesnt match any of its children, break now
                            break;
                        }
                    }
                    let item = hierarchyCopy.pop();
                    let $li = $('[data-key]', opts).eq(hierarchy.indexOf(item));
                    let separator = temp_selector ? ' > ' : '';
                    let classes = $('.cl', $li);
                    let _sel = item.name;
                    $li.find('.active').prop('checked', true);
                    classes.each(function (i, checkbox) {
                        checkbox.checked = true;
                        _sel += '.' + checkbox.name;
                    });
                    temp_selector =  _sel + separator + temp_selector;
                }
            }

            curr_selector = '';
            var prevOn = false;
            var options = getAll('li[data-key]', opts);
            options.forEach(function (li) {
                var item = hierarchy[li.getAttribute('data-key')];
                var active = get('.active', li).checked;
                var _sel = active ? item.name : '';
                var classes = getAll('.cl', li);
                classes.forEach(function (checkbox) {
                    if (checkbox.checked) {
                        _sel += '.' + checkbox.name;
                    }
                });
                if (_sel) {
                    if (prevOn) {
                        curr_selector += ' > ' + _sel;
                    } else {
                        curr_selector += ' ' + _sel;
                    }
                }
                prevOn = active;
            });

            $('.selection_helper', container).remove();

            allmatchedgroups = [];

            if (curr_selector) {
                var elements = getAll(curr_selector);
                var regexp;
                if (matchRegex.value) {
                    try {
                        regexp = new RegExp(matchRegex.value, ignoreCase.checked ? 'i' : '');
                    } catch (ex) {
                        console.warning('bad regex:' + matchRegex.value);
                    }
                }

                elements.forEach(function (ele) {
                    if (regexp) {
                        var txt = matchHTML.checked ? ele.outerHTML : text(ele);
                        if (trim.checked) {
                            txt = txt.replace(/\s*([<>])\s*/g, '$1').trim();
                        }
                        if (regexp.test(txt) === false) {
                            return;
                        }
                    }
                    for (var i = 0; i < elements.length; i++) {
                        if (ele !== elements[i] && ele.contains(elements[i])) {
                            return;
                        }
                    }

                    // group starts with only element matches by selector
                    var group = [ele];

                    // then we add siblings if requested
                    var nSiblings = parseInt(addSiblings.value);
                    if (nSiblings) {
                        var sblings = toArray(ele.parentNode.children);
                        var startIndex = sblings.indexOf(ele) + (nSiblings > 0 ? 0 : nSiblings);
                        var length = Math.abs(nSiblings) + 1;
                        if (startIndex < 0) {
                            length += startIndex;
                            startIndex = 0;
                        }
                        var choosen = sblings.splice(startIndex, length);
                        if (nSiblings < 0) {
                            choosen.reverse();
                        }
                        // if already exists in selected elements
                        // lets skipt it and following siblings too
                        var indexPrev = choosen.findIndex(function (el) {
                            return elements.indexOf(el) !== -1 && el !== ele;
                        });
                        if (indexPrev !== -1) {
                            choosen.splice(indexPrev);
                        }
                        group = choosen;
                    }
                    // lets get the farthest positions of group {top|left|bottom|right}
                    var pos = group.reduce(function (prev, curr) {
                        var rect = curr.getBoundingClientRect();
                        return {
                            top:    Math.min( prev.top || 1e9   , rect.top ),
                            left:   Math.min( prev.left || 1e9  , rect.left ),
                            bottom: Math.max( prev.bottom || 0  , rect.bottom ),
                            right:  Math.max( prev.right || 0   , rect.right )
                        };
                    }, {});
                    allmatchedgroups.push(group);
                    var help = document.createElement('div');
                    help.className = 'selection_helper';
                    // Mark requested groups with red boxes (helpers)
                    help.style.cssText = getHelperCSS(pos);
                    container.appendChild(help);
                });
            }
        };

        $(opts).on('change', render);
        $(matchRegex).on('keydown', utils.stopPropagation);
        $(matchRegex).on('keypress', utils.stopPropagation);
        $(matchRegex).on('keyup', render);
        $(addSiblings).on('change', render);
        $(window).on('scroll.chrome-scraper', render);
        render(null, true);

        finishBtn.addEventListener('click', function () {
            $data.allmatchedgroups = allmatchedgroups;
            $data.trigger('step3');
        });

    };

    var step3 = function ($data) {
        
        var columns = {};
        var allmatchedgroups = $data.allmatchedgroups;
        var pContainer = utils.determineParagraphContainer(allmatchedgroups);
        pContainer = pContainer ? ',' + pContainer : '';
        allmatchedgroups.forEach(function (group, groupIndex) {
            var groupTags = group.reduce(function (prev, curr) {
                var deepChildren = [];
                if (curr.childNodes.length) {
                    deepChildren = utils.getDeepestChildNodesInOrder(curr, NO_CHILDREN_OF + pContainer);
                }
                // lets include the container, to have a column
                // with each's text
                deepChildren.unshift(curr);
                return deepChildren.concat(prev);
            }, []);

            groupTags.forEach(function (ele) {
                var textNode = false;

                // include in :text selector if is inline element
                
                if (utils.isTextNode(ele) || utils.isInlineAndVisibleElement(ele)) {
                    textNode = true;
                }

                var ref = textNode ? ele.parentElement : ele;
                var groupId;
                
                // search if a valid selector/column already exists
                // where to put the data
                Object.keys(columns).forEach(function (key) {
                    var _key = key.replace(/\[.+?\]/, '').replace(/:text/, '');
                    if (ref.matches(_key)) {
                        groupId = _key;
                    }
                    if (!groupId && groupIndex !== 0) {
                        // lets try a bit harder because the columns -probably- already exists when > 1
                        // lets keep the first class only
                        var moreloose = _key.replace(/(\.[^ ]+)\.[^ ]+/g, '$1');
                        if (ref.matches(moreloose)) {
                            groupId = _key;
                        }
                    }
                });

                // if no valid selector/column exists create a new one
                if (!groupId) {
                    groupId = utils.getSelector(ref, group);
                    // delete nth-childs from selector if matched element has 1 or more classes
                    if (/[.]/.test(groupId.split(' ').pop())) {
                        groupId = groupId.replace(/:nth-child\(\d+?\)/g, '');
                    }
                    // don't include root selector (meaning, the first one) -if its not the only one- 
                    if (groupId.replace(/^.+? (> )?/, '')) {
                        groupId = groupId.replace(/^.+? (> )?/, '');
                    }
                }

                if (textNode) {
                    groupId += ':text';
                }

                // add space or new line as glue if needed
                if (textNode && columns[groupId] && columns[groupId][groupIndex]) {
                    if (ele.previousSibling &&
                        text(ele.previousSibling).match(/([^ ]|^) $/) ||
                        text(ele).match(/^ ([^ ]|$)/)) {
                            columns[groupId][groupIndex] += ' ';
                    } else {
                            columns[groupId][groupIndex] += '\r\n';
                    }
                } 


                if (text(ele).trim()) {
                    var txt = text(ele).trim();
                    
                    if (utils.matches(ele, NO_CHILDREN_OF)) {
                        var deepChildren = utils.getDeepestChildNodesInOrder(ele);
                        txt = deepChildren.reduce(function (prev, curr) {
                            if (utils.isTextNode(curr) || utils.isInlineAndVisibleElement(curr)) {
                                return prev + ' ' + text(curr);
                            } else {
                                return prev + '\r\n' + text(curr);
                            }
                        }, '').trim();
                    }
                    if (!columns[groupId]) {
                        columns[groupId] = [];
                    }
                    if (!columns[groupId][groupIndex]) {
                        columns[groupId][groupIndex] = '';
                    }
                    columns[groupId][groupIndex] += txt;
                }

                var value = '';

                if (ele.tagName === 'A' && ele.href) {
                    groupId += '[href]';
                    value = ele.href;
                }

                if (ele.tagName === 'IMG' && ele.src) {
                    groupId += '[src]';
                    value = ele.src;
                }

                if (/^(INPUT|TEXTAREA|SELECT)$/.test(ele.tagName) && ele.value && ele.name) {
                    groupId += '[name="' + ele.name + '"]';
                    if (ele.tagName === 'SELECT') {
                        value = toArray(ele.selectedOptions).map(text).join(', ');
                    } else {
                        value = ele.value;
                    }
                }

                if (value) {

                    columns[groupId] = columns[groupId] || [];

                    if (columns[groupId][groupIndex]) {
                        columns[groupId][groupIndex] += '\n' + value;
                    } else {
                        columns[groupId][groupIndex] = value;
                    }
                }

            }, []);
        });

        var rows = [];
        var offset = 0;
        rows[0] = [];
        
        // add new columns with text patterns detected (e.g. 23 comments)
        Object.keys(columns).forEach(function (key) {
            var new_columns = utils.breakByTextPatterns(columns[key]);
            if (utils.realLength(new_columns)) {
                for (var col in new_columns) {
                    if (columns[col]) {
                        if (utils.realLength(new_columns[col]) > utils.realLength(columns[col])) {
                            columns[col] = new_columns[col];
                        }
                    } else {
                        columns[col] = new_columns[col];
                    }
                }
            }
        });

        // determine how long is the longest column, for later use
        var longestColumn = 0;
        Object.keys(columns).forEach(function (key) {
            longestColumn = Math.max(longestColumn, utils.realLength(columns[key]));
        });

        // delete the columns with little info (less than a half of all rows)
        Object.keys(columns).forEach(function (key) {
            if (utils.realLength(columns[key]) * 2 < longestColumn) {
                delete columns[key];
            }
        });

        Object.keys(columns).forEach(function (key, j) {
            if (DEBUG) {
                rows[0][j] = key;
            }
            for (var i = 0; i < columns[key].length; i++) {
                // where it creates each row
                rows[i + 1] = rows[i + 1] || [];
                // fill each cell
                if (rows[i + 1][j - offset] === undefined) {
                    rows[i + 1][j - offset] = columns[key][i] || '';
                }
            }
        });

        terminate();

        $data.rows = rows;
        $data.trigger('step4');

    };

    var step4 = function ($data) {

        // send to the other script to generate the google spread sheet file
        chrome.runtime.sendMessage({rows: $data.rows, title: document.title}, function(response) {
            if (DEBUG) {
                console.log(response);
            }
        });
    };

    var createShadowDOM = function (data) {
        
        var screen_pos = $.extend({}, data.clickedEl.getBoundingClientRect());
        var $csc = $('<div id="chrome_scrap_container">').appendTo('body');

        // Create the first shadow root
        var shadowroot = $csc[0].createShadowRoot();
        var $container = $('<div>').attr('style', container_css).html(container_html);

        var $form1 = $container.find('#form1');
        var $options_list = $container.find('#options_list');

        shadowroot.appendChild($container[0]);

        screen_pos.top += screen_pos.height + 10;
        
        var topMax = utils.viewportHeight() - $form1.outerHeight();
        var leftMax = utils.viewportWidth() - $form1.outerWidth();

        if (screen_pos.top > topMax) {
            screen_pos.top = topMax;
        }
        if (screen_pos.left > leftMax) {
            screen_pos.left = leftMax;
        }
        
        $form1.css({left: screen_pos.left, top: screen_pos.top});

        $container.find('a.exit').on('click', terminate);
        
        $form1.draggabilly({
            containment: $container[0],
            handle: '.handle'
        });

        $options_list.draggabilly({
            containment: $container[0],
            handle: '.handle'
        });

        return $container[0];
    };

    var getHelperCSS = function (pos) {
        return `
            bottom: ${utils.viewportHeight() - pos.bottom}px;
            right: ${utils.viewportWidth() - pos.right}px;
            left: ${pos.left}px;
            top: ${pos.top}px
            `;
    };

    var terminate = function () {
        $(window).off('.chrome-scraper');
        $('#chrome_scrap_container').remove();
        return false;
    };

});
