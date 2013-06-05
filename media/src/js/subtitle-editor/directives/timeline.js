// Amara, universalsubtitles.org
//
// Copyright (C) 2013 Participatory Culture Foundation
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see
// http://www.gnu.org/licenses/agpl-3.0.html.

var angular = angular || null;

(function($) {
    var MIN_DURATION = 250; // 0.25 seconds
    var DEFAULT_DURATION = 4000; // 4.0 seconds
    
    /*
     * Define a couple of helper classes to handle updating the timeline
     * elements.  Our basic strategy is to make a really wide div, so that we
     * have a bit of a buffer, then scroll the div instead of re-rendering
     * everything.
     */
    function durationToPixels(duration, scale) {
        // by default 1 pixel == 10 ms.  scope.scale can adjusts that,
        // although there isn't any interface for it.
        return Math.floor(scale * duration / 10);
    }

    function pixelsToDuration(width, scale) {
        return width * 10 / scale;
    }

    function BufferTimespan(scope) {
        /* Stores the time range of the entire div.*/
        this.duration = 60000; // Buffer 1 minute of subtitles.
        // Position the buffer so that most of it is in front of the current
        // time.
        if(scope.currentTime !== null) {
            var currentTime = scope.currentTime;
        } else {
            var currentTime = 0;
        }
        this.startTime = currentTime - this.duration / 4;
        // We don't want to buffer negative times, but do let startTime go to
        // -0.5 seconds because the left side of the "0" is slightly left of
        // time=0.
        if(this.startTime < -500) {
            this.startTime = -500;
        }
        this.endTime = this.startTime + this.duration;
        this.width = durationToPixels(this.duration, scope.scale);
    }

    function VisibleTimespan(scope, width, deltaMSecs) {
        /* Stores the portion of the video time that is displayed in the
         * timeline.
         */

        this.scale = scope.scale;
        this.duration = pixelsToDuration(width, this.scale);
        if(scope.currentTime !== null) {
            var currentTime = scope.currentTime;
        } else {
            var currentTime = 0;
        }
        this.startTime = currentTime - this.duration / 2;
        if(deltaMSecs) {
            this.startTime += deltaMSecs;
        }
        this.endTime = this.startTime + this.duration;
    }

    VisibleTimespan.prototype.fitsInBuffer = function(bufferTimespan) {
        if(this.startTime >= 0 && this.startTime < bufferTimespan.startTime) {
            return false;
        }
        if(this.endTime > bufferTimespan.endTime) {
            return false;
        }
        return true;
    }

    VisibleTimespan.prototype.positionDiv = function(bufferTimespan, div) {
        var deltaTime = this.startTime - bufferTimespan.startTime;
        div.css('left', -durationToPixels(deltaTime, this.scale) + 'px');
    }

    var directives = angular.module('amara.SubtitleEditor.directives.timeline', []);

    directives.directive('timelineTiming', function() {
        return function link(scope, elem, attrs) {
            var canvas = $(elem);
            var canvasElt = elem[0];
            var container = canvas.parent();
            var width=0, height=65; // dimensions of the canvas
            var containerWidth = container.width();
            var bufferTimespan = null;
            var visibleTimespan = null;

            function drawSecond(ctx, xPos, t) {
                // draw the second text on the timeline
                ctx.fillStyle = '#686868';
                var metrics = ctx.measureText(t);
                var x = xPos - (metrics.width / 2);
                ctx.fillText(t, x, 60);
            }
            function drawTics(ctx, xPos) {
                // draw the tic marks between seconds
                ctx.strokeStyle = '#686868';
                var divisions = 4;
                var step = durationToPixels(1000/divisions, scope.scale);
                ctx.lineWidth = 1;
                ctx.beginPath();
                for(var i = 1; i < divisions; i++) {
                    var x = Math.floor(0.5 + xPos + step * i);
                    x += 0.5;
                    ctx.moveTo(x, 60);
                    if(i == divisions / 2) {
                        // draw an extra long tic for the 50% mark;
                        ctx.lineTo(x, 45);
                    } else {
                        ctx.lineTo(x, 50);
                    }
                }
                ctx.stroke();
            }
            function drawCanvas() {
                var ctx = canvasElt.getContext("2d");
                ctx.clearRect(0, 0, width, height);
                ctx.font = (height / 5) + 'px Open Sans';

                var startTime = Math.floor(bufferTimespan.startTime / 1000);
                var endTime = Math.floor(bufferTimespan.endTime / 1000);
                if(startTime < 0) {
                    startTime = 0;
                }
                if(scope.duration !== null && endTime > scope.duration / 1000) {
                    endTime = Math.floor(scope.duration / 1000);
                }

                for(var t = startTime; t < endTime; t++) {
                    var ms = t * 1000;
                    var xPos = durationToPixels(ms - bufferTimespan.startTime,
                            scope.scale);
                    drawSecond(ctx, xPos, t);
                    drawTics(ctx, xPos);
                }
            }

            function makeNewBuffer() {
                bufferTimespan = new BufferTimespan(scope);
                if(bufferTimespan.width != width) {
                    // Resize the width of the canvas to match the buffer
                    width = bufferTimespan.width;
                    canvasElt.width = width;
                    canvas.css('width', width + 'px');
                }
                drawCanvas();
            }

            // Put redrawCanvas in the scope, so that the controller can call
            // it.
            scope.redrawCanvas = function(deltaMSecs) {
                visibleTimespan = new VisibleTimespan(scope, containerWidth,
                        deltaMSecs);
                if(bufferTimespan === null ||
                    !visibleTimespan.fitsInBuffer(bufferTimespan)) {
                    makeNewBuffer();
                }
                visibleTimespan.positionDiv(bufferTimespan, canvas);
            };
            $(window).resize(function() {
                containerWidth = container.width();
                scope.redrawCanvas();
            });
            scope.$on('timeline-drag', function(evt, deltaMSecs) {
                scope.redrawCanvas(deltaMSecs);
            });

            // Okay, finally done defining functions, let's draw the canvas.
            scope.redrawCanvas();
        }
    });

    directives.directive('timelineSubtitles', function(VideoPlayer) {
        return function link(scope, elem, attrs) {
            var timelineDiv = $(elem);
            var container = timelineDiv.parent();
            var containerWidth = container.width();
            var timelineDivWidth = 0;
            var bufferTimespan = null;
            var visibleTimespan = null;
            // Map XML subtitle nodes to the div we created to show them
            var timelineDivs = {}
            // Store the DIV for the unsynced subtitle
            var unsyncedDiv = null;
            var unsyncedSubtitle = null;

            function handleDragLeft(context, deltaMSecs) {
                context.startTime = context.subtitle.startTime + deltaMSecs;
                if(context.startTime < context.minStartTime) {
                    context.startTime = context.minStartTime;
                }
                if(context.startTime > context.endTime - MIN_DURATION) {
                    context.startTime = context.endTime - MIN_DURATION;
                }
            }

            function handleDragRight(context, deltaMSecs) {
                context.endTime = context.subtitle.endTime + deltaMSecs;
                if(context.maxEndTime !== null &&
                        context.endTime > context.maxEndTime) {
                            context.endTime = context.maxEndTime;
                        }
                if(context.endTime < context.startTime + MIN_DURATION) {
                    context.endTime = context.startTime + MIN_DURATION;
                }
            }

            function handleDragMiddle(context, deltaMSecs) {
                context.startTime = context.subtitle.startTime + deltaMSecs;
                context.endTime = context.subtitle.endTime + deltaMSecs;

                if(context.startTime < context.minStartTime) {
                    context.startTime = context.minStartTime;
                    context.endTime = (context.startTime +
                            context.subtitle.duration());
                }
                if(context.endTime > context.maxEndTime) {
                    context.endTime = context.maxEndTime;
                    context.startTime = (context.endTime -
                            context.subtitle.duration());
                }

            }

            function subtitleList() {
                return scope.workingSubtitles.subtitleList;
            }

            function handleMouseDown(evt, dragHandler) {
                if(!scope.workingSubtitles.allowsSyncing) {
                    evt.preventDefault();
                    return false;
                }
                VideoPlayer.pause();
                var subtitle = evt.data.subtitle;
                var dragHandler = evt.data.dragHandler;
                var context = {
                    subtitle: subtitle,
                    startTime: subtitle.startTime,
                    endTime: subtitle.endTime,
                }
                if(subtitle !== unsyncedSubtitle) {
                    var realSubtitle = subtitle;
                } else {
                    var realSubtitle = subtitle.realSubtitle;
                }
                var nextSubtitle = subtitleList().nextSubtitle(realSubtitle);
                if(nextSubtitle && nextSubtitle.isSynced()) {
                    context.maxEndTime = nextSubtitle.startTime;
                } else {
                    context.maxEndTime = scope.duration;
                }
                var prevSubtitle = subtitleList().prevSubtitle(realSubtitle);
                if(prevSubtitle) {
                    context.minStartTime = prevSubtitle.endTime;
                } else {
                    context.minStartTime = 0;
                }

                var div = timelineDivs[context.subtitle.id];
                if(div === undefined) {
                    return;
                }
                var initialPageX = evt.pageX;
                $(document).on('mousemove.timelinedrag', function(evt) {
                    var deltaX = evt.pageX - initialPageX;
                    var deltaMSecs = pixelsToDuration(deltaX, scope.scale);
                    dragHandler(context, deltaMSecs);
                    placeSubtitle(context.startTime, context.endTime, div);
                }).on('mouseup.timelinedrag', function(evt) {
                    $(document).off('.timelinedrag');
                    subtitleList().updateSubtitleTime(realSubtitle,
                        context.startTime, context.endTime);
                    scope.$root.$emit("work-done");
                    scope.$root.$digest();
                }).on('mouseleave.timelinedrag', function(evt) {
                    $(document).off('.timelinedrag');
                    placeSubtitle(subtitle.startTime, subtitle.endTime, div);
                });
                // need to prevent the default event from happening so that the
                // browser's DnD code doesn't mess with us.
                evt.preventDefault();
                return false;
            }

            function makeDivForSubtitle(subtitle) {
                var div = $('<div/>', {class: 'subtitle'});
                var span = $('<span/>');
                span.html(subtitle.content());
                var left = $('<a href="#" class="handle left"></a>');
                var right = $('<a href="#" class="handle right"></a>');
                left.on('mousedown',
                        {subtitle: subtitle, dragHandler: handleDragLeft},
                        handleMouseDown);
                right.on('mousedown',
                        {subtitle: subtitle, dragHandler: handleDragRight},
                        handleMouseDown);
                span.on('mousedown',
                        {subtitle: subtitle, dragHandler: handleDragMiddle},
                        handleMouseDown);
                div.append(left);
                div.append(span);
                div.append(right);
                timelineDiv.append(div);
                return div;
            }

            function updateDivForSubtitle(div, subtitle) {
                $('span', div).html(subtitle.content());
                if(subtitle.isSynced()) {
                    div.removeClass('unsynced');
                }
            }

            function handleMouseDownInTimeline(evt) {
                var initialPageX = evt.pageX;
                $(document).on('mousemove.timelinedrag', function(evt) {
                    VideoPlayer.pause();
                    var deltaX = initialPageX - evt.pageX;
                    var deltaMSecs = pixelsToDuration(deltaX, scope.scale);
                    scope.redrawSubtitles({
                        deltaMSecs: deltaMSecs,
                    });
                    scope.$emit('timeline-drag', deltaMSecs);
                }).on('mouseup.timelinedrag', function(evt) {
                    $(document).off('.timelinedrag');
                    var deltaX = initialPageX - evt.pageX;
                    var deltaMSecs = pixelsToDuration(deltaX, scope.scale);
                    VideoPlayer.seek(scope.currentTime + deltaMSecs);
                }).on('mouseleave.timelinedrag', function(evt) {
                    $(document).off('.timelinedrag');
                    scope.redrawSubtitles();
                    scope.$emit('timeline-drag', 0);
                });
                evt.preventDefault();
            }

            function placeSubtitle(startTime, endTime, div) {
                var x = durationToPixels(startTime - bufferTimespan.startTime,
                        scope.scale);
                var width = durationToPixels(endTime - startTime,
                        scope.scale);
                div.css({left: x, width: width});
            }

            function getUnsyncedSubtitle() {
                /* Sometimes we want to show the first unsynced subtitle for
                 * the timeline.
                 *
                 * This method calculates if we want to show the subtitle, and
                 * if so, it returns an object that mimics the SubtitleItem
                 * API for the unsynced subtitle.
                 *
                 * If we shouldn't show the subtitle, it returns null.
                 */
                var lastSynced = subtitleList().lastSyncedSubtitle();
                if(lastSynced !== null &&
                    lastSynced.endTime > scope.currentTime) {
                    // Not past the end of the synced subtitles
                    return null;
                }
                var unsynced = subtitleList().firstUnsyncedSubtitle();
                if(unsynced === null) {
                    return null;
                }
                if(unsynced.startTime >= 0 && unsynced.startTime >
                        bufferTimespan.endTime) {
                    // unsynced subtitle has its start time set, and it's past
                    // the end of the timeline.
                    return null;
                }
                if(unsynced.startTime < 0) {
                    var startTime = scope.currentTime;
                    var endTime = scope.currentTime + DEFAULT_DURATION;
                } else {
                    var startTime = unsynced.startTime;
                    var endTime = Math.max(scope.currentTime,
                            unsynced.startTime + MIN_DURATION);
                }
                // Make a fake subtitle to show on the timeline.
                return {
                    realSubtitle: unsynced,
                    id: unsynced.id,
                    startTime: startTime,
                    endTime: endTime,
                    isAt: function(time) {
                        return startTime <= time && time < endTime;
                    },
                    duration: function() { return endTime - startTime; },
                    content: function() { return unsynced.content() },
                    isSynced: function() { return false; }
                };
            }

            function checkShownSubtitle() {
                // First check if the current subtitle is still shown, this is
                // the most common case, and it's fast
                if(scope.subtitle !== null &&
                    scope.subtitle.isAt(scope.currentTime)) {
                    return;
                }

                var shownSubtitle = subtitleList().subtitleAt(
                        scope.currentTime);
                if(shownSubtitle === null &&
                    unsyncedSubtitle !== null &&
                    unsyncedSubtitle.isAt(scope.currentTime)) {
                    shownSubtitle = unsyncedSubtitle;
                }
                if(shownSubtitle != scope.subtitle) {
                    scope.subtitle = shownSubtitle;
                    scope.$root.$emit('timeline-subtitle-shown',
                            shownSubtitle);
                    scope.$root.$digest();
                }
            }

            function placeSubtitles() {
                if(!scope.workingSubtitles) {
                    return;
                }
                var subtitles = subtitleList().getSubtitlesForTime(
                        bufferTimespan.startTime, bufferTimespan.endTime);
                var oldTimelineDivs = timelineDivs;
                timelineDivs = {}

                for(var i = 0; i < subtitles.length; i++) {
                    var subtitle = subtitles[i];
                    if(oldTimelineDivs.hasOwnProperty(subtitle.id)) {
                        var div = oldTimelineDivs[subtitle.id];
                        timelineDivs[subtitle.id] = div;
                        updateDivForSubtitle(div, subtitle);
                        delete oldTimelineDivs[subtitle.id];
                    } else {
                        var div = makeDivForSubtitle(subtitle);
                        timelineDivs[subtitle.id] = div;
                    }
                    placeSubtitle(subtitle.startTime, subtitle.endTime,
                            timelineDivs[subtitle.id]);
                }
                // remove divs no longer in the timeline
                for(var subId in oldTimelineDivs) {
                    oldTimelineDivs[subId].remove();
                }
            }
            function placeUnsyncedSubtitle() {
                unsyncedSubtitle = getUnsyncedSubtitle();
                if(unsyncedSubtitle !== null) {
                    if(unsyncedDiv === null) {
                        unsyncedDiv = makeDivForSubtitle(unsyncedSubtitle);
                        unsyncedDiv.addClass('unsynced')
                    } else {
                        updateDivForSubtitle(unsyncedDiv, unsyncedSubtitle);
                    }
                    placeSubtitle(unsyncedSubtitle.startTime,
                            unsyncedSubtitle.endTime, unsyncedDiv);
                } else if(unsyncedDiv !== null) {
                    unsyncedDiv.remove();
                    unsyncedDiv = null;
                }
            }
            // Put redrawSubtitles in the scope so that the controller can
            // call it.
            scope.redrawSubtitles = function(options) {
                if(options === undefined) {
                    options = {};
                }
                visibleTimespan = new VisibleTimespan(scope, containerWidth,
                        options.deltaMSecs);
                if(bufferTimespan === null ||
                    !visibleTimespan.fitsInBuffer(bufferTimespan)) {
                        bufferTimespan = new BufferTimespan(scope);
                    if(bufferTimespan.width != timelineDivWidth) {
                        timelineDivWidth = bufferTimespan.width;
                        timelineDiv.css('width', bufferTimespan.width + 'px');
                    }
                    placeSubtitles();
                } else if(options.forcePlace) {
                    placeSubtitles();
                }
                // always need to place the unsynced subtitle, since it
                // changes with the current time.
                placeUnsyncedSubtitle();
                checkShownSubtitle();

                visibleTimespan.positionDiv(bufferTimespan, timelineDiv);
            };

            // Handle drag and drop.
            timelineDiv.on('mousedown', handleMouseDownInTimeline);
            $(window).resize(function() {
                containerWidth = container.width();
                scope.redrawSubtitles();
            });
        }
    });
})(window.AmarajQuery);