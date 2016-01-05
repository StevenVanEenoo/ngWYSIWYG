(function(angular, window) {
    'use strict';
    angular.module('ngWYSIWYG', ['ngSanitize']);

    var editorTemplate = "<div class=\"tinyeditor\">" +
    "<div class=\"tinyeditor-header\" ng-hide=\"editMode\">" +
    "{toolbar}" + // <-- we gonna replace it with the configured toolbar
    "<div style=\"clear: both;\"></div>" +
    "</div>" +
    "<div class=\"sizer\">" +
    "<textarea data-placeholder-attr=\"\" style=\"-webkit-box-sizing: border-box; -moz-box-sizing: border-box; box-sizing: border-box; resize: none; width: 100%; height: 100%;\" ng-show=\"editMode\" ng-model=\"content\"></textarea>" +
    "<iframe style=\"-webkit-box-sizing: border-box; -moz-box-sizing: border-box; box-sizing: border-box; width: 100%; height: 100%;\" ng-hide=\"editMode\" wframe=\"{sanitize: config.sanitize}\" ng-model=\"content\"></iframe>" +
    "</div>" +
    "</div>";

    //debug sanitize
    angular.module('ngWYSIWYG').config(['$provide', function($provide) {
        $provide.decorator("$sanitize", function($delegate, $log) {
            return function(text, target) {
                return $delegate(text, target);
            };
        });
    }]);

    angular.module('ngWYSIWYG').directive('wframe', ['$compile', '$timeout', '$sanitize', function($compile, $timeout, $sanitize) {
        //kudos http://stackoverflow.com/questions/13881834/bind-angular-cross-iframes-possible
        var linker = function( scope, $element, attrs, ctrl ) {
            var $document = $element[0].contentDocument;
            $document.open(); //damn Firefox. kudos: http://stackoverflow.com/questions/15036514/why-can-i-not-set-innerhtml-of-an-iframe-body-in-firefox
            $document.write('<!DOCTYPE html><html><head></head><body contenteditable="true"></body></html>');
            $document.close();
            $document.designMode = 'On';
            var $body = angular.element($element[0].contentDocument.body);
            var $head = angular.element($element[0].contentDocument.head);
            $body.attr('contenteditable', 'true');

            ctrl.$render = function() {
                $body[0].innerHTML = ctrl.$viewValue ? $sanitize(ctrl.$viewValue) : '';
            };

            scope.sync = function() {
                scope.$evalAsync(function(scope) {
                    ctrl.$setViewValue($body.html());
                });
            };

            var getSelectionBoundaryElement = function(win, isStart) {
                var range, sel, container = null;
                var doc = win.document;
                if (doc.selection) {
                    // IE branch
                    range = doc.selection.createRange();
                    range.collapse(isStart);
                    return range.parentElement();
                }
                else if (doc.getSelection) {
                    //firefox
                    sel = doc.getSelection();
                    if (sel.rangeCount > 0) {
                        range = sel.getRangeAt(0);
                        container = range[isStart ? "startContainer" : "endContainer"];
                        if (container.nodeType === 3) {
                            container = container.parentNode;
                        }
                    }
                }
                else if (win.getSelection) {
                    // Other browsers
                    sel = win.getSelection();
                    if (sel.rangeCount > 0) {
                        range = sel.getRangeAt(0);
                        container = range[isStart ? "startContainer" : "endContainer"];

                        // Check if the container is a text node and return its parent if so
                        if (container.nodeType === 3) {
                            container = container.parentNode;
                        }
                    }
                }
                return container;
            };

            var debounce = null; //we will debounce the event in case of the rapid movement. Overall, we are intereseted in the last cursor/caret position
            $body.on('click keyup change paste', debouncer);

            function debouncer() {
                if(debounce) {
                    $timeout.cancel(debounce);
                }
                debounce = $timeout(function blurkeyup() {
                    ctrl.$setViewValue($body.html());
                    //check the caret position
                    //http://stackoverflow.com/questions/14546568/get-parent-element-of-caret-in-iframe-design-mode
                    var el = getSelectionBoundaryElement($element[0].contentWindow, true);
                    if(el) {
                        var computedStyle = $element[0].contentWindow.getComputedStyle(el);
                        var elementStyle = {
                            'bold': (computedStyle.getPropertyValue("font-weight") == 'bold' || parseInt(computedStyle.getPropertyValue("font-weight")) >= 700),
                            'italic': (computedStyle.getPropertyValue("font-style") == 'italic'),
                            'underline': (computedStyle.getPropertyValue("text-decoration") == 'underline'),
                            'strikethrough': (computedStyle.getPropertyValue("text-decoration") == 'line-through'),
                            'font': computedStyle.getPropertyValue("font-family"),
                            'size': parseInt(computedStyle.getPropertyValue("font-size")),
                            'color': computedStyle.getPropertyValue("color"),
                            'sub': (computedStyle.getPropertyValue("vertical-align") == 'sub'),
                            'super': (computedStyle.getPropertyValue("vertical-align") == 'super'),
                            'background': computedStyle.getPropertyValue("background-color"),
                            'alignment': computedStyle.getPropertyValue("text-align")
                        };
                        //dispatch upward the through the scope chain
                        scope.$emit('cursor-position', elementStyle);
                    }
                }, 100, true /*invoke apply*/);
            }

            scope.range = null;
            scope.getSelection = function() {
                if($document.getSelection) {
                    var sel = $document.getSelection();
                    if(sel.getRangeAt && sel.rangeCount) {
                        scope.range = sel.getRangeAt(0);
                    }
                }
            };

            scope.restoreSelection = function() {
                if(scope.range && $document.getSelection) {
                    var sel = $document.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(scope.range);
                }
            };

            var execCommandListener = scope.$on('execCommand', function(e, cmd) {
                $element[0].contentDocument.body.focus();
                var sel = $document.selection; //http://stackoverflow.com/questions/11329982/how-refocus-when-insert-image-in-contenteditable-divs-in-ie
                if (sel) {
                    var textRange = sel.createRange();
                    $document.execCommand(cmd.command, 0, cmd.arg);
                    textRange.collapse(false);
                    textRange.select();
                }
                else {
                    $document.execCommand(cmd.command, 0, cmd.arg);
                }
                $document.body.focus();
                scope.sync();
            });

            scope.$on('$destroy', function() {
                // remove listeners
                execCommandListener();
                $body.off('click keyup change paste', debouncer);
            });
        };

        return {
            link    : linker,
            require : 'ngModel',
            scope   : {
                config: '=wframe'
            },
            replace  : true,
            restrict : 'AE'
        };
    }]);

    angular.module('ngWYSIWYG').directive('wysiwygEdit', ['$compile', '$timeout', '$q', function($compile, $timeout, $q) {
        var linker = function( scope, $element, attrs, ctrl ) {
            scope.editMode = false;
            scope.cursorStyle = {};

            scope.panelButtons = {
                '-': "<div class=\"tinyeditor-divider\"></div>",
                bold: "<div class=\"tinyeditor-control\" title=\"Bold\" style=\"background-position: 34px -120px;\" ng-class=\"{\'pressed\': cursorStyle.bold}\" ng-click=\"execCommand(\'bold\')\"></div>",
                italic: "<div class=\"tinyeditor-control\" title=\"Italic\" style=\"background-position: 34px -150px;\" ng-class=\"{\'pressed\': cursorStyle.italic}\" ng-click=\"execCommand(\'italic\')\"></div>",
                underline: "<div class=\"tinyeditor-control\" title=\"Underline\" style=\"background-position: 34px -180px;\" ng-class=\"{\'pressed\': cursorStyle.underline}\" ng-click=\"execCommand(\'underline\')\"></div>",
                strikethrough: "<div class=\"tinyeditor-control\" title=\"Strikethrough\" style=\"background-position: 34px -210px;\" ng-class=\"{\'pressed\': cursorStyle.strikethrough}\" ng-click=\"execCommand(\'strikethrough\')\"></div>",
                format: "<ul class=\"tinyeditor-control-format\"><li ng-repeat=\"s in styles\" ng-click=\"styleChange(s)\" ng-bind=\"s.name\"></li></ul>",
                removeFormatting: "<div class=\"tinyeditor-control\" title=\"Remove Formatting\" style=\"background-position: 34px -720px;\" ng-click=\"execCommand(\'removeformat\')\"></div>",
                undo: "<div class=\"tinyeditor-control\" title=\"Undo\" style=\"background-position: 34px -540px;\" ng-click=\"execCommand(\'undo\')\"></div>"
            };

            scope.toolbar = [
                { name: 'basicStyling', items: ['bold', 'italic', 'underline', 'strikethrough'] },
                { name: 'styling', items: ['format'] },
                { name: 'doers', items: ['removeFormatting', 'undo'] },
            ];

            //compile the template
            var toolbarGroups = [];
            angular.forEach(scope.toolbar, function(buttonGroup, index) {
                var buttons = [];
                angular.forEach(buttonGroup.items, function(button, index) {
                    this.push( scope.panelButtons[button] );
                }, buttons);
                this.push(
                    "<div class=\"tinyeditor-buttons-group\">" +
                    buttons.join('') +
                    "</div>"
                );
            }, toolbarGroups);

            var template = editorTemplate.replace('{toolbar}', toolbarGroups.join(''));
            $element.html( template );
            $compile($element.contents())(scope);

            /*
            * send the event to the iframe's controller to exec the command
            */
            scope.execCommand = function(cmd, arg) {
                switch(cmd) {
                    case 'bold':
                    scope.cursorStyle.bold = !scope.cursorStyle.bold;
                    break;
                    case 'italic':
                    scope.cursorStyle.italic = !scope.cursorStyle.italic;
                    break;
                    case 'underline':
                    scope.cursorStyle.underline = !scope.cursorStyle.underline;
                    break;
                    case 'strikethrough':
                    scope.cursorStyle.strikethrough = !scope.cursorStyle.strikethrough;
                    break;
                }
                scope.$broadcast('execCommand', {command: cmd, arg: arg});
            };

            scope.fontsizes = [{key: 1, name: 'x-small'}, {key: 2, name: 'small'}, {key: 3, name: 'normal'}, {key: 4, name: 'large'}, {key: 5, name: 'x-large'}, {key: 6, name: 'xx-large'}, {key: 7, name: 'xxx-large'}];
            scope.mapFontSize = { 10: 1, 13: 2, 16: 3, 18: 4, 24: 5, 32: 6, 48: 7};

            scope.styles = [{name: 'H1', key: '<h1>'}, {name: 'H2', key: '<h2>'}, {name: 'H3', key: '<h3>'}];
            scope.styleChange = function(s) {
                scope.execCommand('formatblock', s.key );
            };

            $element.ready(function() {
                function makeUnselectable(node) {
                    if (node.nodeType == 1) {
                        node.setAttribute("unselectable", "on");
                        node.unselectable = 'on';
                    }
                    var child = node.firstChild;
                    while (child) {
                        makeUnselectable(child);
                        child = child.nextSibling;
                    }
                }
                //IE fix
                for(var i = 0; i < window.document.getElementsByClassName('tinyeditor-header').length; i += 1) {
                    makeUnselectable(window.document.getElementsByClassName("tinyeditor-header")[i]);
                }
            });
            //catch the cursort position style
            scope.$on('cursor-position', function(event, data) {
                scope.cursorStyle = data;
                scope.font = data.font.replace(/(')/g, ''); //''' replace single quotes
                scope.fontsize = scope.mapFontSize[data.size]? scope.mapFontSize[data.size] : 0;
            });
        };

        return {
            link: linker,
            scope: {
                content: ' =', //this is our content which we want to edit
                api    : ' =', //this is our api object
                config : ' ='
            },
            restrict: 'AE',
            replace: true
        };
    }]);
})(window.angular, window);
