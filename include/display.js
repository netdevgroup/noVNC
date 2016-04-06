/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2012 Joel Martin
 * Copyright (C) 2015 Samuel Mannehed for Cendio AB
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

/*jslint browser: true, white: false */
/*global Util, Base64, changeCursor */

var Display;

(function () {
    "use strict";

    Display = function (defaults) {
        this._drawCtx = null;
        this._c_forceCanvas = false;

        this._renderQ = [];  // queue drawing actions for in-oder rendering

        // the full frame buffer (logical canvas) size
        this._fb_width = 0;
        this._fb_height = 0;

        // the size limit of the viewport (start disabled)
        this._maxWidth = 0;
        this._maxHeight = 0;

        // the visible "physical canvas" viewport
        this._viewportLoc = { 'x': 0, 'y': 0, 'w': 0, 'h': 0 };
        this._cleanRect = { 'x1': 0, 'y1': 0, 'x2': -1, 'y2': -1 };

        this._prevDrawStyle = "";
        this._tile = null;
        this._tile16x16 = null;
        this._tile_x = 0;
        this._tile_y = 0;

        Util.set_defaults(this, defaults, {
            'true_color': true,
            'colourMap': [],
            'scale': 1.0,
            'viewport': false,
            'render_mode': ''
        });

        Util.Debug(">> Display.constructor");

        if (!this._target) {
            throw new Error("Target must be set");
        }

        if (typeof this._target === 'string') {
            throw new Error('target must be a DOM element');
        }

        if (!this._target.getContext) {
            throw new Error("no getContext method");
        }

        if (!this._drawCtx) {
            this._drawCtx = this._target.getContext('2d');
        }

        Util.Debug("User Agent: " + navigator.userAgent);
        if (Util.Engine.gecko) { Util.Debug("Browser: gecko " + Util.Engine.gecko); }
        if (Util.Engine.webkit) { Util.Debug("Browser: webkit " + Util.Engine.webkit); }
        if (Util.Engine.trident) { Util.Debug("Browser: trident " + Util.Engine.trident); }
        if (Util.Engine.presto) { Util.Debug("Browser: presto " + Util.Engine.presto); }

        this.clear();

        // Check canvas features
        if ('createImageData' in this._drawCtx) {
            this._render_mode = 'canvas rendering';
        } else {
            throw new Error("Canvas does not support createImageData");
        }

        if (this._prefer_js === null) {
            Util.Info("Prefering javascript operations");
            this._prefer_js = true;
            // rjones 2015.06.13 - Couldn't find initialization for this anywhere.
            this._tile16x16 = this._drawCtx.createImageData(16, 16);
        }

        // Determine browser support for setting the cursor via data URI scheme
        if (this._cursor_uri || this._cursor_uri === null ||
                this._cursor_uri === undefined) {
            this._cursor_uri = Util.browserSupportsCursorURIs(this._target);
        }

        Util.Debug("<< Display.constructor");
    };

    Display.prototype = {
        // Public methods
        viewportChangePos: function (deltaX, deltaY) {
            var vp = this._viewportLoc;

            if (!this._viewport) {
                deltaX = -vp.w;  // clamped later of out of bounds
                deltaY = -vp.h;
            }

            var vx2 = vp.x + vp.w - 1;
            var vy2 = vp.y + vp.h - 1;

            // Position change

            if (deltaX < 0 && vp.x + deltaX < 0) {
                deltaX = -vp.x;
            }
            if (vx2 + deltaX >= this._fb_width) {
                deltaX -= vx2 + deltaX - this._fb_width + 1;
            }

            if (vp.y + deltaY < 0) {
                deltaY = -vp.y;
            }
            if (vy2 + deltaY >= this._fb_height) {
                deltaY -= (vy2 + deltaY - this._fb_height + 1);
            }

            if (deltaX === 0 && deltaY === 0) {
                return;
            }
            Util.Debug("viewportChange deltaX: " + deltaX + ", deltaY: " + deltaY);

            vp.x += deltaX;
            vx2 += deltaX;
            vp.y += deltaY;
            vy2 += deltaY;

            // Update the clean rectangle
            var cr = this._cleanRect;
            if (vp.x > cr.x1) {
                cr.x1 = vp.x;
            }
            if (vx2 < cr.x2) {
                cr.x2 = vx2;
            }
            if (vp.y > cr.y1) {
                cr.y1 = vp.y;
            }
            if (vy2 < cr.y2) {
                cr.y2 = vy2;
            }

            var x1, w;
            if (deltaX < 0) {
                // Shift viewport left, redraw left section
                x1 = 0;
                w = -deltaX;
            } else {
                // Shift viewport right, redraw right section
                x1 = vp.w - deltaX;
                w = deltaX;
            }

            var y1, h;
            if (deltaY < 0) {
                // Shift viewport up, redraw top section
                y1 = 0;
                h = -deltaY;
            } else {
                // Shift viewport down, redraw bottom section
                y1 = vp.h - deltaY;
                h = deltaY;
            }

            // Copy the valid part of the viewport to the shifted location
            var saveStyle = this._drawCtx.fillStyle;
            var canvas = this._target;
            this._drawCtx.fillStyle = "rgb(255,255,255)";
            if (deltaX !== 0) {
                this._drawCtx.drawImage(canvas, 0, 0, vp.w, vp.h, -deltaX, 0, vp.w, vp.h);
                this._drawCtx.fillRect(x1, 0, w, vp.h);
            }
            if (deltaY !== 0) {
                this._drawCtx.drawImage(canvas, 0, 0, vp.w, vp.h, 0, -deltaY, vp.w, vp.h);
                this._drawCtx.fillRect(0, y1, vp.w, h);
            }
            this._drawCtx.fillStyle = saveStyle;
        },

        viewportChangeSize: function(width, height) {

            if (typeof(width) === "undefined" || typeof(height) === "undefined") {

                Util.Debug("Setting viewport to full display region");
                width = this._fb_width;
                height = this._fb_height;
            }

            var vp = this._viewportLoc;
            if (vp.w !== width || vp.h !== height) {

                if (this._viewport) {
                    if (this._maxWidth !== 0 && width > this._maxWidth) {
                        width = this._maxWidth;
                    }
                    if (this._maxHeight !== 0 && height > this._maxHeight) {
                        height = this._maxHeight;
                    }
                }

                var cr = this._cleanRect;

                if (width < vp.w &&  cr.x2 > vp.x + width - 1) {
                    cr.x2 = vp.x + width - 1;
                }
                if (height < vp.h &&  cr.y2 > vp.y + height - 1) {
                    cr.y2 = vp.y + height - 1;
                }

                vp.w = width;
                vp.h = height;

                var canvas = this._target;
                if (canvas.width !== width || canvas.height !== height) {

                    // We have to save the canvas data since changing the size will clear it
                    var saveImg = null;
                    if (vp.w > 0 && vp.h > 0 && canvas.width > 0 && canvas.height > 0) {
                        var img_width = canvas.width < vp.w ? canvas.width : vp.w;
                        var img_height = canvas.height < vp.h ? canvas.height : vp.h;
                        saveImg = this._drawCtx.getImageData(0, 0, img_width, img_height);
                    }

                    if (canvas.width  !== width)  { canvas.width  = width; }
                    if (canvas.height !== height) { canvas.height = height; }

                    if (this._viewport) {
                        canvas.style.height = height + 'px';
                        canvas.style.width = width + 'px';
                    }

                    if (saveImg) {
                        this._drawCtx.putImageData(saveImg, 0, 0);
                    }
                }
            }
        },

        // Return a map of clean and dirty areas of the viewport and reset the
        // tracking of clean and dirty areas
        //
        // Returns: { 'cleanBox': { 'x': x, 'y': y, 'w': w, 'h': h},
        //            'dirtyBoxes': [{ 'x': x, 'y': y, 'w': w, 'h': h }, ...] }
        getCleanDirtyReset: function () {
            var vp = this._viewportLoc;
            var cr = this._cleanRect;

            var cleanBox = { 'x': cr.x1, 'y': cr.y1,
                             'w': cr.x2 - cr.x1 + 1, 'h': cr.y2 - cr.y1 + 1 };

            var dirtyBoxes = [];
            if (cr.x1 >= cr.x2 || cr.y1 >= cr.y2) {
                // Whole viewport is dirty
                dirtyBoxes.push({ 'x': vp.x, 'y': vp.y, 'w': vp.w, 'h': vp.h });
            } else {
                // Redraw dirty regions
                var vx2 = vp.x + vp.w - 1;
                var vy2 = vp.y + vp.h - 1;

                if (vp.x < cr.x1) {
                    // left side dirty region
                    dirtyBoxes.push({'x': vp.x, 'y': vp.y,
                                     'w': cr.x1 - vp.x + 1, 'h': vp.h});
                }
                if (vx2 > cr.x2) {
                    // right side dirty region
                    dirtyBoxes.push({'x': cr.x2 + 1, 'y': vp.y,
                                     'w': vx2 - cr.x2, 'h': vp.h});
                }
                if(vp.y < cr.y1) {
                    // top/middle dirty region
                    dirtyBoxes.push({'x': cr.x1, 'y': vp.y,
                                     'w': cr.x2 - cr.x1 + 1, 'h': cr.y1 - vp.y});
                }
                if (vy2 > cr.y2) {
                    // bottom/middle dirty region
                    dirtyBoxes.push({'x': cr.x1, 'y': cr.y2 + 1,
                                     'w': cr.x2 - cr.x1 + 1, 'h': vy2 - cr.y2});
                }
            }

            this._cleanRect = {'x1': vp.x, 'y1': vp.y,
                               'x2': vp.x + vp.w - 1, 'y2': vp.y + vp.h - 1};

            return {'cleanBox': cleanBox, 'dirtyBoxes': dirtyBoxes};
        },

        absX: function (x) {
            return x + this._viewportLoc.x;
        },

        absY: function (y) {
            return y + this._viewportLoc.y;
        },

        resize: function (width, height) {
            this._prevDrawStyle = "";

            this._fb_width = width;
            this._fb_height = height;

            this._rescale(this._scale);

            this.viewportChangeSize();
        },
        
        /*
        clear: function () {
            if (this._logo) {
                this.resize(this._logo.width, this._logo.height);
                this.blitStringImage(this._logo.data, 0, 0);
            } else {
                if (Util.Engine.trident === 6) {
                    // NB(directxman12): there's a bug in IE10 where we can fail to actually
                    //                   clear the canvas here because of the resize.
                    //                   Clearing the current viewport first fixes the issue
                    this._drawCtx.clearRect(0, 0, this._viewportLoc.w, this._viewportLoc.h);
                }
                this.resize(240, 20);
                this._drawCtx.clearRect(0, 0, this._viewportLoc.w, this._viewportLoc.h);
            }

            this._renderQ = [];
        },*/
        
        // Simplified clear
        clear: function ( ) {
            this._drawCtx.clearRect(0, 0, this._viewportLoc.w, this._viewportLoc.h);
            this._renderQ = [];
        },

        fillRect: function (x, y, width, height, color) {
            this._setFillColor(color);
            this._drawCtx.fillRect(x - this._viewportLoc.x, y - this._viewportLoc.y, width, height);
        },

        copyImage: function (old_x, old_y, new_x, new_y, w, h) {
            var x1 = old_x - this._viewportLoc.x;
            var y1 = old_y - this._viewportLoc.y;
            var x2 = new_x - this._viewportLoc.x;
            var y2 = new_y - this._viewportLoc.y;

            this._drawCtx.drawImage(this._target, x1, y1, w, h, x2, y2, w, h);
        },

        // start updating a tile
        startTile: function (x, y, width, height, color) {
            this._tile_x = x;
            this._tile_y = y;
            if (width === 16 && height === 16) {
                this._tile = this._tile16x16;
            } else {
                this._tile = this._drawCtx.createImageData(width, height);
            }
            
            if (this._prefer_js) {
                var rgba = this._getRgbaColor(color),

                    red   = rgba[0],
                    green = rgba[1],
                    blue  = rgba[2],

                    data = this._tile.data;
                
                for (var i = 0; i < width * height * 4; i += 4) {
                    data[i]     = red;
                    data[i + 1] = green;
                    data[i + 2] = blue;
                    data[i + 3] = 255;
                }
            } else {
                this.fillRect(x, y, width, height, color);
            }
        },

        // update sub-rectangle of the current tile
        subTile: function (x, y, w, h, color) {
            if (this._prefer_js) {
                var rgba = this._getRgbaColor( color );
                
                var red   = rgba[0];
                var green = rgba[1];
                var blue  = rgba[2];

                var xend = x + w;
                var yend = y + h;

                var data = this._tile.data;
                var width = this._tile.width;
                for (var j = y; j < yend; j++) {
                    for (var i = x; i < xend; i++) {
                        var p = (i + (j * width)) * 4;
                        data[p] = red;
                        data[p + 1] = green;
                        data[p + 2] = blue;
                        data[p + 3] = 255;
                    }
                }
            } else {
                this.fillRect(this._tile_x + x, this._tile_y + y, w, h, color);
            }
        },

        // draw the current tile to the screen
        finishTile: function () {
            if (this._prefer_js) {
                this._drawCtx.putImageData(this._tile, this._tile_x - this._viewportLoc.x,
                                           this._tile_y - this._viewportLoc.y);
            }
            // else: No-op -- already done by setSubTile
        },
        

        blitImage: function (x, y, width, height, arr, offset) {
//            if (this._true_color) {
//                this._bgrxImageData(x, y, this._viewportLoc.x, this._viewportLoc.y, width, height, arr, offset);
//            } else {
//                this._cmapImageData(x, y, this._viewportLoc.x, this._viewportLoc.y, width, height, arr, offset);
//            }
            var img = this._drawCtx.createImageData(width, height);
            var data = img.data;
            this._writeRgbaPixels(width * height, arr, offset, data, 0);
            this._drawCtx.putImageData(img, 
                                       x - this._viewportLoc.x, 
                                       y - this._viewportLoc.y);
        },

        // TODO: Remove after color model is working for all encodings.
        blitRgbImage: function (x, y , width, height, arr, offset) {
//            if (this._true_color) {
//                this._rgbImageData(x, y, this._viewportLoc.x, this._viewportLoc.y, width, height, arr, offset);
//            } else {
//                // probably wrong?
//                this._cmapImageData(x, y, this._viewportLoc.x, this._viewportLoc.y, width, height, arr, offset);
//            }
            var img = this._drawCtx.createImageData(width, height);
            var data = img.data;
            this._writeRgbaRgb(width * height, arr, offset, data, 0);
            this._drawCtx.putImageData(img, 
                                       x - this._viewportLoc.x, 
                                       y - this._viewportLoc.y);
        },
        
        blitTightImage: function (x, y , width, height, arr, offset) {
            var img = this._drawCtx.createImageData(width, height);
            var data = img.data;
            this._writeRgbaTight(width * height, arr, offset, data, 0);
            this._drawCtx.putImageData(img, 
                                       x - this._viewportLoc.x, 
                                       y - this._viewportLoc.y);
        },

        blitStringImage: function (str, x, y) {
            var img = new Image();
            img.onload = function () {
                this._drawCtx.drawImage(img, x - this._viewportLoc.x, y - this._viewportLoc.y);
            }.bind(this);
            img.src = str;
            return img; // for debugging purposes
        },

        // wrap ctx.drawImage but relative to viewport
        drawImage: function (img, x, y) {
            this._drawCtx.drawImage(img, x - this._viewportLoc.x, y - this._viewportLoc.y);
        },

        renderQ_push: function (action) {
            this._renderQ.push(action);
            if (this._renderQ.length === 1) {
                // If this can be rendered immediately it will be, otherwise
                // the scanner will start polling the queue (every
                // requestAnimationFrame interval)
                this._scan_renderQ();
            }
        },

        changeCursor: function (pixels, mask, hotx, hoty, w, h) {
            if (this._cursor_uri === false) {
                Util.Warn("changeCursor called but no cursor data URI support");
                return;
            }

            if (this._true_color) {
                Display.changeCursor(this._target, pixels, mask, hotx, hoty, w, h);
            } else {
                Display.changeCursor(this._target, pixels, mask, hotx, hoty, w, h, this._colourMap);
            }
        },

        defaultCursor: function () {
            this._target.style.cursor = "default";
        },

        disableLocalCursor: function () {
            this._target.style.cursor = "none";
        },

        clippingDisplay: function () {
            var vp = this._viewportLoc;

            var fbClip = this._fb_width > vp.w || this._fb_height > vp.h;
            var limitedVp = this._maxWidth !== 0 && this._maxHeight !== 0;
            var clipping = false;

            if (limitedVp) {
                clipping = vp.w > this._maxWidth || vp.h > this._maxHeight;
            }

            return fbClip || (limitedVp && clipping);
        },

        // Overridden getters/setters
        get_context: function () {
            return this._drawCtx;
        },

        set_scale: function (scale) {
            this._rescale(scale);
        },

        set_width: function (w) {
            this._fb_width = w;
        },
        get_width: function () {
            return this._fb_width;
        },

        set_height: function (h) {
            this._fb_height =  h;
        },
        get_height: function () {
            return this._fb_height;
        },
        
        //this._fb_Bpp, this._fb_depth, big_endian this._true_color
        set_color_model: function (Bpp, depth, big_endian, true_color) {
            
            var dsply_proto = Display.prototype;
            this._fb_Bpp   = Bpp
            this._fb_depth = depth;
            this._big_endian = big_endian;
            this._true_color = true_color;
            
            if(!true_color) {
                dsply_proto._getRgbaColor        = this._getRgba_map;
                dsply_proto._writeRgbaPixels     = this._writeRgba_map;
                return
            }
            
            dsply_proto._writeRgbaRgb    = this._writeRgba_24;
            
            switch (depth) {
                case 2:
                    if (big_endian) {
                        dsply_proto._getRgbaColor    = this._getRgba_16;
                        dsply_proto._getRgbaTight    = this._getRgba_16;
                        dsply_proto._writeRgbaPixels = this._writeRgba_16;
                        dsply_proto._writeRgbaTight  = this._writeRgba_16;
                    } else {
                        dsply_proto._getRgbaColor    = this._getRgba_16le;
                        dsply_proto._getRgbaTight    = this._getRgba_16le;
                        dsply_proto._writeRgbaPixels = this._writeRgba_16le;
                        dsply_proto._writeRgbaTight  = this._writeRgba_16le;
                    }
                    break;
                case 1:
                    dsply_proto._getRgbaColor        = this._getRgba_8;
                    dsply_proto._writeRgbaPixels     = this._writeRgba_8;
                    break;
                default:
                    if (big_endian) {
                        //WTF!!!!  Why is 24-bit color the same for little-endian and big-endian.
                        //         I whould have thought the byte order would be reversed, but it
                        //         doesn't seem to be.
                        //         Byte order does seem to be reversed for 16-bit color however.
                        dsply_proto._getRgbaColor    = this._getRgba_32le;
                        dsply_proto._getRgbaTight    = this._getRgba_24le;
                        dsply_proto._writeRgbaPixels = this._writeRgba_32le;
                        dsply_proto._writeRgbaTight  = this._writeRgba_24le;
                    } else {
                        dsply_proto._getRgbaColor    = this._getRgba_32le;
                        dsply_proto._getRgbaTight    = this._getRgba_24le;
                        dsply_proto._writeRgbaPixels = this._writeRgba_32le;
                        dsply_proto._writeRgbaTight  = this._writeRgba_24le;
                    }
                    break;
            }
        },

        autoscale: function (containerWidth, containerHeight, downscaleOnly) {
            var targetAspectRatio = containerWidth / containerHeight;
            var fbAspectRatio = this._fb_width / this._fb_height;

            var scaleRatio;
            if (fbAspectRatio >= targetAspectRatio) {
                scaleRatio = containerWidth / this._fb_width;
            } else {
                scaleRatio = containerHeight / this._fb_height;
            }

            var targetW, targetH;
            if (scaleRatio > 1.0 && downscaleOnly) {
                targetW = this._fb_width;
                targetH = this._fb_height;
                scaleRatio = 1.0;
            } else if (fbAspectRatio >= targetAspectRatio) {
                targetW = containerWidth;
                targetH = Math.round(containerWidth / fbAspectRatio);
            } else {
                targetW = Math.round(containerHeight * fbAspectRatio);
                targetH = containerHeight;
            }

            // NB(directxman12): If you set the width directly, or set the
            //                   style width to a number, the canvas is cleared.
            //                   However, if you set the style width to a string
            //                   ('NNNpx'), the canvas is scaled without clearing.
            this._target.style.width = targetW + 'px';
            this._target.style.height = targetH + 'px';

            this._scale = scaleRatio;

            return scaleRatio;  // so that the mouse, etc scale can be set
        },

        // Private Methods
        _rescale: function (factor) {
            this._scale = factor;

            var w;
            var h;

            if (this._viewport &&
                this._maxWidth !== 0 && this._maxHeight !== 0) {
                w = Math.min(this._fb_width, this._maxWidth);
                h = Math.min(this._fb_height, this._maxHeight);
            } else {
                w = this._fb_width;
                h = this._fb_height;
            }

            this._target.style.width = Math.round(factor * w) + 'px';
            this._target.style.height = Math.round(factor * h) + 'px';
        },

        _setFillColor: function (color) {
            var rgba = this._getRgbaColor(color),
                newStyle = 'rgb(' + rgba[0] + ',' + rgba[1] + ',' + rgba[2] + ')';
            if (newStyle !== this._prevDrawStyle) {
                this._drawCtx.fillStyle = newStyle;
                this._prevDrawStyle = newStyle;
            }
        },
        
        /**
         * @method _getRgbaColor
         * @param color {Array} 
         */
        _getRgbaColor: function (color) {
            
        },
        _getRgbaTight: function (color) {
            
        },
        _writeRgbaPixels: function (num, src, si, dst, di) {
            Util.warn("_writeRgbaPixels is an abstract function and must be overridden.");
        },
        _writeRgbaTight: function (num, src, si, dst, di) {
            Util.warn("_writeRgbaTight is an abstract function and must be overridden.");
        },
        

//        _bgrxImageData: function (x, y, vx, vy, width, height, arr, offset) {
//            var img = this._drawCtx.createImageData(width, height);
//            var data = img.data;
//            this._writePixels(width * height, data, 0, arr, offset);
//            this._drawCtx.putImageData(img, x - vx, y - vy);
//        },
//        
//
//        _cmapImageData: function (x, y, vx, vy, width, height, arr, offset) {
//            var img = this._drawCtx.createImageData(width, height);
//            var data = img.data;
//            var cmap = this._colourMap;
//            for (var i = 0, j = offset; i < width * height * 4; i += 4, j++) {
//                var bgr = cmap[arr[j]];
//                data[i]     = bgr[2];
//                data[i + 1] = bgr[1];
//                data[i + 2] = bgr[0];
//                data[i + 3] = 255;  // Alpha
//            }
//            this._drawCtx.putImageData(img, x - vx, y - vy);
//        },

        _scan_renderQ: function () {
            var ready = true;
            while (ready && this._renderQ.length > 0) {
                var a = this._renderQ[0];
                switch (a.type) {
                    case 'copy':
                        this.copyImage(a.old_x, a.old_y, a.x, a.y, a.width, a.height);
                        break;
                    case 'fill':
                        this.fillRect(a.x, a.y, a.width, a.height, a.color);
                        break;
                    case 'blit':
                        this.blitImage(a.x, a.y, a.width, a.height, a.data, 0);
                        break;
                    // TODO: Remove this case when we are sure blit will handle
                    //       both cases correctly.
                    case 'blitRgb':
                        this.blitRgbImage(a.x, a.y, a.width, a.height, a.data, 0);
                        break;
                    case 'blitTight':
                        this.blitTightImage(a.x, a.y, a.width, a.height, a.data, 0);
                        break;
                    case 'img':
                        if (a.img.complete) {
                            this.drawImage(a.img, a.x, a.y);
                        } else {
                            // We need to wait for this image to 'load'
                            // to keep things in-order
                            ready = false;
                        }
                        break;
                }

                if (ready) {
                    this._renderQ.shift();
                }
            }

            if (this._renderQ.length > 0) {
                requestAnimFrame(this._scan_renderQ.bind(this));
            }
        },
        
        
        
        // B8G8R8X8
        _getRgba_32le: function (color) {
            return [
                    color[2],
                    color[1],
                    color[0],
                    255
                ];
        },
        // R8G8B8X8
        _getRgba_32: function (color) {
            return [
                    color[0],
                    color[1],
                    color[2], 
                    255
                ];
        },
        _getRgba_24le: function (color) {
            return [
                    color[2],
                    color[1],
                    color[0],
                    255
                ];
        },
        _getRgba_24: function (color) {
            return [
                    color[0],
                    color[1],
                    color[2], 
                    255
                ];
        },
        /** 
         * Converts a 2-element array representing a 16-bit color value in 
         * little-endian format (GGGBBBBB RRRRRGGG) 
         * to a 4-element array representing a single RGBA 
         * color value with R in the low address (first element).
         * 
         * @param color {Array} A 2-element array representing a 16-bit color 
         *   value with the low byte as the first element.
         * @returns {Array} A 4-element array representing an RGBA color value 
         *   with R in the lowest address and A in the highest address.
         */
        // G3B5R5G3
        _getRgba_16le: function (color) {
            var rgb16 = (color[1] << 8) | color[0];
            return [
                    ((rgb16 >>> 11) & 31) * 8,
                    ((rgb16 >>>  5) & 63) * 4,
                    ( rgb16         & 31) * 8,
                    255
                ];
        },
        // R5G6B5
        _getRgba_16: function (color) {
            var rgb16 = (color[0] << 8) | color[1];
            return [
                    ((rgb16 >>> 11) & 31) * 8,
                    ((rgb16 >>>  5) & 63) * 4,
                    ( rgb16         & 31) * 8,
                    255
                ];
        }, 
        // B2G3R3
        _getRgba_8: function (color) {
            return [
                ( color         & 7) * 36,
                ((color >>>  3) & 7) * 36,
                ((color >>>  6) & 3) * 85,
                255
            ];
        },
        // INDEX
        _getRgba_map: function (index) {
            return [
                cmap[index][0],
                cmap[index][1],
                cmap[index][2],
                255
            ];
        },
        
        
        // B8G8R8X8
        _writeRgba_32le: function (num, src, si, dst, di) {
            for (; di < num * 4; di += 4, si += 4) {
                dst[di]     = src[si + 2];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si];
                dst[di + 3] = 255;
            }
        },
        // R8G8B8X8
        _writeRgba_32: function (num, src, si, dst, di) {
            for (; di < num * 4; di += 4, si += 4) {
                dst[di]     = src[si];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2];
                dst[di + 3] = 255;
            }
        },
        // B8G8R8 
        _writeRgba_24le: function (num, src, si, dst, di) {
            for (; di < num * 4; di += 4, si += 3) {
                dst[di]     = src[si + 2];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si];
                dst[di + 3] = 255;
            }
        },
        // R8G8B8
        _writeRgba_24: function (num, src, si, dst, di) {
            for (; di < num * 4; di += 4, si += 3) {
                dst[di]     = src[si];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2];
                dst[di + 3] = 255;
            }
        },
        // G3B5R5G3
        _writeRgba_16le: function (num, src, si, dst, di) {
            var rgb16;
            for (; di < num * 4; di += 4, si += 2) {
                rgb16 = (src[si + 1] << 8) | src[si];
                dst[di]     = ((rgb16 >>> 11) & 31) * 8;
                dst[di + 1] = ((rgb16 >>>  5) & 63) * 4;
                dst[di + 2] = ( rgb16         & 31) * 8;
                dst[di + 3] = 255;
            }
        },
        // R5G6B5
        _writeRgba_16: function (num, src, si, dst, di) {
            var rgb16;
            for (; di < num * 4; di += 4, si += 2) {
                rgb16 = (src[si] << 8) | src[si + 1];
                dst[di]     = ((rgb16 >>> 11) & 31) * 8;
                dst[di + 1] = ((rgb16 >>>  5) & 63) * 4;
                dst[di + 2] = ( rgb16         & 31) * 8;
                dst[di + 3] = 255;
            }
        },
        // B2G3R3
        _writeRgba_8: function (num, src, si, dst, di) {
            var bgr8;
            for (; di < num * 4; di += 4, si += 1) {
                bgr8 = src[si];
                dst[di]     = ( bgr8         & 7) * 36;
                dst[di + 1] = ((bgr8 >>>  3) & 7) * 36;
                dst[di + 2] = ((bgr8 >>>  6) & 3) * 85;
                dst[di + 3] = 255;
            }
        },
        // COLOR MAP
        _writeRgba_map: function (num, src, si, dst, di) {
            var color
            for (; di < num * 4; di += 4, si += 1) {
                color = cmap[src[si]];
                dst[di]     = color[0];
                dst[di + 1] = color[1];
                dst[di + 2] = color[2];
                dst[di + 3] = 255;
            }
        },
        
        
        _rgbImageData: function (x, y, vx, vy, width, height, arr, offset) {
            var img = this._drawCtx.createImageData(width, height);
            var data = img.data;
            for (var i = 0, j = offset; i < width * height * 4; i += 4, j += 3) {
                data[i]     = arr[j];
                data[i + 1] = arr[j + 1];
                data[i + 2] = arr[j + 2];
                data[i + 3] = 255;  // Alpha
            }
            this._drawCtx.putImageData(img, x - vx, y - vy);
        }
        
    };

    Util.make_properties(Display, [
        ['target', 'wo', 'dom'],       // Canvas element for rendering
        ['context', 'ro', 'raw'],      // Canvas 2D context for rendering (read-only)
        ['logo', 'rw', 'raw'],         // Logo to display when cleared: {"width": w, "height": h, "data": data}
        ['true_color', 'rw', 'bool'],  // Use true-color pixel data
        ['colourMap', 'rw', 'arr'],    // Colour map array (when not true-color)
        ['scale', 'rw', 'float'],      // Display area scale factor 0.0 - 1.0
        ['viewport', 'rw', 'bool'],    // Use viewport clipping
        ['width', 'rw', 'int'],        // Display area width
        ['height', 'rw', 'int'],       // Display area height
        ['maxWidth', 'rw', 'int'],     // Viewport max width (0 if disabled)
        ['maxHeight', 'rw', 'int'],    // Viewport max height (0 if disabled)

        ['render_mode', 'ro', 'str'],  // Canvas rendering mode (read-only)

        ['prefer_js', 'rw', 'bool'],   // Prefer Javascript over canvas methods
        ['cursor_uri', 'rw', 'raw']    // Can we render cursor using data URI
    ]);

    // Class Methods
    Display.changeCursor = function (target, pixels, mask, hotx, hoty, w0, h0, cmap) {
        var w = w0;
        var h = h0;
        if (h < w) {
            h = w;  // increase h to make it square
        } else {
            w = h;  // increase w to make it square
        }

        var cur = [];

        // Push multi-byte little-endian values
        cur.push16le = function (num) {
            this.push(num & 0xFF, (num >> 8) & 0xFF);
        };
        cur.push32le = function (num) {
            this.push(num & 0xFF,
                      (num >> 8) & 0xFF,
                      (num >> 16) & 0xFF,
                      (num >> 24) & 0xFF);
        };

        var IHDRsz = 40;
        var RGBsz = w * h * 4;
        var XORsz = Math.ceil((w * h) / 8.0);
        var ANDsz = Math.ceil((w * h) / 8.0);

        cur.push16le(0);        // 0: Reserved
        cur.push16le(2);        // 2: .CUR type
        cur.push16le(1);        // 4: Number of images, 1 for non-animated ico

        // Cursor #1 header (ICONDIRENTRY)
        cur.push(w);            // 6: width
        cur.push(h);            // 7: height
        cur.push(0);            // 8: colors, 0 -> true-color
        cur.push(0);            // 9: reserved
        cur.push16le(hotx);     // 10: hotspot x coordinate
        cur.push16le(hoty);     // 12: hotspot y coordinate
        cur.push32le(IHDRsz + RGBsz + XORsz + ANDsz);
                                // 14: cursor data byte size
        cur.push32le(22);       // 18: offset of cursor data in the file

        // Cursor #1 InfoHeader (ICONIMAGE/BITMAPINFO)
        cur.push32le(IHDRsz);   // 22: InfoHeader size
        cur.push32le(w);        // 26: Cursor width
        cur.push32le(h * 2);    // 30: XOR+AND height
        cur.push16le(1);        // 34: number of planes
        cur.push16le(32);       // 36: bits per pixel
        cur.push32le(0);        // 38: Type of compression

        cur.push32le(XORsz + ANDsz);
                                // 42: Size of Image
        cur.push32le(0);        // 46: reserved
        cur.push32le(0);        // 50: reserved
        cur.push32le(0);        // 54: reserved
        cur.push32le(0);        // 58: reserved

        // 62: color data (RGBQUAD icColors[])
        var y, x;
        for (y = h - 1; y >= 0; y--) {
            for (x = 0; x < w; x++) {
                if (x >= w0 || y >= h0) {
                    cur.push(0);  // blue
                    cur.push(0);  // green
                    cur.push(0);  // red
                    cur.push(0);  // alpha
                } else {
                    var idx = y * Math.ceil(w0 / 8) + Math.floor(x / 8);
                    var alpha = (mask[idx] << (x % 8)) & 0x80 ? 255 : 0;
                    if (cmap) {
                        idx = (w0 * y) + x;
                        var rgb = cmap[pixels[idx]];
                        cur.push(rgb[2]);  // blue
                        cur.push(rgb[1]);  // green
                        cur.push(rgb[0]);  // red
                        cur.push(alpha);   // alpha
                    } else {
                        idx = ((w0 * y) + x) * 4;  //this.fb_depth;
                        cur.push(pixels[idx + 2]); // blue
                        cur.push(pixels[idx + 1]); // green
                        cur.push(pixels[idx]);     // red
                        cur.push(alpha);           // alpha
                    }
                }
            }
        }

        // XOR/bitmask data (BYTE icXOR[])
        // (ignored, just needs to be the right size)
        for (y = 0; y < h; y++) {
            for (x = 0; x < Math.ceil(w / 8); x++) {
                cur.push(0);
            }
        }

        // AND/bitmask data (BYTE icAND[])
        // (ignored, just needs to be the right size)
        for (y = 0; y < h; y++) {
            for (x = 0; x < Math.ceil(w / 8); x++) {
                cur.push(0);
            }
        }

        var url = 'data:image/x-icon;base64,' + Base64.encode(cur);
        target.style.cursor = 'url(' + url + ')' + hotx + ' ' + hoty + ', default';
    };
    
    // 
    Display.colorModel = function (Bpp, depth, big_endian, true_color) {
        
        var _bytesPerPixel = Bpp,
            _colorDepth    = depth,
            _bigEndian     = big_endian,
            _trueColor     = true_color,
            _colorMap      = [];
        
        function isClientBigEndian () {
            var b = new ArrayBuffer(2);
            var a = new Uint16Array(b);
            var c = new Uint8Array(b);
            a[0] = 0xABCD;
            if (c[0] == 0xAB) return true;
            return false;
        }
        
        return {
            getRgbaColor:    _getRgbaColor,
            getRgbaTight:    _getRgbaTight,
            writeRgbaPixels: _writeRgbaPixels,
            writeRgbaTight:  _writeRgbaTight
        };
    };
    
    
})();
