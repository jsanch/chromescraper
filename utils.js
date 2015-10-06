
/* global define */

define(['jquery'], function($) {

    'use strict';

    var utils = {

        abs: function (str) {
            return Math.abs(parseInt(str));
        },

        isTextNode: function (ele) {
            return ele && ele.nodeType === 3;
        },

        getAll: function (sel, root) {
            return [].slice.call((root || document).querySelectorAll(sel));
        },

        get: function (sel, root) {
            return (root || document).querySelector(sel);
        },

        toArray: function (a) {
            return [].slice.call(a);
        },

        realLength: function (obj) {
            return Object.keys(obj).length;
        },

        viewportWidth: function () {
            return Math.min(window.innerWidth, document.body.offsetWidth);
        },

        viewportHeight: function () {
            return Math.min(window.innerHeight, document.body.offsetHeight);
        },

        isLastItem: function (array, item) {
            return item === array[array.length - 1];
        },

        text: function (a) {
            return (a.innerText || a.textContent).replace(/(\r?\n){2,}/g, '\r\n');
        },

        stopPropagation: function (event) {
            event.stopPropagation();
        },

        matches: function (a, b) {
            if (a && a.matches && a.matches(b)) {
                return true;
            }
            return false;
        },

        isVisibleNode: function (ele) {
            if (ele.nodeType !== 1 && ele.nodeType !== 3) {
                return false;
            }
            if (utils.isTextNode(ele)) {
                ele = ele.parentNode;
            }
            var style = getComputedStyle(ele);
            return utils.abs(style['text-indent']) < 200 &&
                ele.offsetWidth > 3 &&
                ele.offsetHeight > 3;           
        },

        isInlineAndVisibleElement: function (ele) {
            if (utils.isTextNode(ele)) {
                return false;
            }
            var style = getComputedStyle(ele);
            return /inline/.test(style.display) && utils.isVisibleNode(ele);
        },

        flattenArray: function (arr) {
            return [].concat.apply([], arr);
        },

        determineParagraphContainer: function (groups) {
            var $containers = $(utils.flattenArray(groups));
            var prev = {};
            var paragraphScore = {};
            // lets score based on how different containers childsare
            // more different == more likely to be a paragraph container
            groups.forEach(function (group) {
                var allChilds = group.reduce(function (prev, tag) {
                    return prev.concat(utils.getAll('*', tag));
                }, []);
                allChilds.forEach(function(tag){
                    if (tag.children.length) {
                        var selector = utils.getSelector(tag, group);
                        // if matched element has no classes at all
                        // lets keep the nth-child for it
                        if (/ [^ .]+$/.test(selector)) {
                            selector = selector.replace(/:nth-child\(\d+?\)(?= )/g, '');
                        } else {
                            selector = selector.replace(/:nth-child\(\d+?\)/g, '');
                        }
                        selector = selector.replace(/^.+? (> )?/, '');
                        var contentMark = utils.toArray(tag.children).map(function (child) {
                            return child.tagName + '.' + child.className.trim().replace(/\s+/, '.');
                        }).join(' + ');
                        if (!prev[selector]) {
                            paragraphScore[selector] = 0;                    
                        } else if (prev[selector] !== contentMark) {
                            paragraphScore[selector]++;
                        } else {
                            paragraphScore[selector]--;
                        }
                        prev[selector] = contentMark;
                    }
                });
            });
            var biggestContainer = 0;
            var paragraphContainer = '';
            for (var sel in paragraphScore) {
                // check if there is approximately one match in each container
                // 10% tolerance
                var diff = groups.length - $containers.find(sel).closest($containers).length;
                if (Math.abs(diff) < groups.length / 10) {
                    //  check if score is good enough                =  
                    if (paragraphScore[sel] * 2 > $containers.length) {
                        if (paragraphScore[sel] > biggestContainer) {
                            biggestContainer = paragraphScore[sel];
                            paragraphContainer = sel;
                        } 
                    }
                }
            }

            return paragraphContainer;

        },

        breakByTextPatterns: function (arr) {
            
            var words_already_analized = [];
            var new_columns = {};

            arr.forEach(function (phrase) {
                if (!phrase) {
                    return;
                }

                phrase.split(/\s+/).forEach(function (word) {

                    // Detection of number followed by word, e.g. 24 comments
                    var singular = word.replace(/ies$/, 'y').replace(/(.)s$/, '$1');
                    if (/^\d+$/.test(word) || words_already_analized.indexOf(singular) !== -1) {
                        return;
                    } else {
                        words_already_analized.push(singular);
                    }
                    var column = singular;
                    new_columns[column] = [];
                    arr.forEach(function (phrase, k) {
                        var numberRegex = /\d+\s+/g;
                        var submatches;
                        while ((submatches = numberRegex.exec(phrase)) !== null) {
                            if (numberRegex.lastIndex === phrase.indexOf(word)) {
                                new_columns[column][k] = submatches[0] + word;
                                break;
                            }
                            if (numberRegex.lastIndex === phrase.indexOf(singular)) {
                                new_columns[column][k] = submatches[0] + singular;
                                break;
                            }
                        }
                    });
                    // at least half rows must have occurrence
                    if (Object.keys(new_columns[column]).length * 2 < arr.length) {
                        delete new_columns[column];
                    }
                });
            });
            return new_columns;
        },

        getDeepestChildNodesInOrder: function (tag, avoidChildrenOf, result, alreadyTags) {
            result = result || [];
            alreadyTags = alreadyTags || [];
            if (alreadyTags.indexOf(tag) === -1) {
                alreadyTags.push(tag);
                var isVisible = utils.isVisibleNode(tag);
                var isChildless = (tag.childNodes.length === 0 || (avoidChildrenOf && utils.matches(tag, avoidChildrenOf)));
                if (isVisible && isChildless && !utils.matches(tag, 'br, hr')) {
                    result.push(tag);
                }
                if (tag.childNodes[0] && !(avoidChildrenOf && utils.matches(tag, avoidChildrenOf))) {
                    return utils.getDeepestChildNodesInOrder(tag.childNodes[0], avoidChildrenOf, result, alreadyTags);
                }
            }
            // if already reached initial tag lets finish this recursion
            if (tag === alreadyTags[0]) { 
                return result;
            }
            return utils.getDeepestChildNodesInOrder(tag.nextSibling || tag.parentNode, avoidChildrenOf, result, alreadyTags);
        },

        getSelector: function (a, roots) {
            var curr = a;
            var selector = '';
            while (curr) {
                if (curr.tagName === 'HTML') {
                    break;
                }
                var sel = '';

                sel = curr.tagName.toLowerCase();
                if (curr.className && curr.tagName !== 'BODY') {
                    sel += curr.className.trim().replace(/\s+|^/g, '.');
                }
                if (curr.parentElement && curr.tagName !== 'BODY') {
                    var siblings = [].slice.call(curr.parentElement.children);
                    var nth_child = siblings.indexOf(curr) + 1;
                    // if (nth_child !== 1)
                    sel += ':nth-child(' + nth_child + ')';
                }
                if (curr !== a) {
                    sel += ' > ';
                }
                selector = sel + selector; 

                if (roots && curr && roots.indexOf(curr) !== -1) {
                    break;
                }
                curr = curr.parentElement;
            }
            return selector.trim();
        }


    };

    return utils;
});

