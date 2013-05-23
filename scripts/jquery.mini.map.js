/* 
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */


(function( $ ){
    var cache_v=5;
    //global scope
    var settings = {
        'code':{
            'ok':0,
            'error':-1
        },
        'config':false,
        'map':{
            width:800,
            height:600
        },
        'store_id':-1,
        'datasource':'map/map_dataprovider.php',
        'templates':{
            'main':'../map/templates/map.html?v='+cache_v
        },
        'contents':{}
        
    };
    var datastorage={
        map:null,        
        current_moving:null,
        data:null,/* storage for main data request - for reset operation!*/
        mapOptions:null,
        undo:null,
        /*  new ones */
        markerArrayObject:null,
        log_num:1
    }
    var dataprovider={
        loadMapConfig: function(_params,_callback){
            dataprovider.loadData('load_config', _params ,_callback);               
        },
        saveMapConfig: function(_params,_callback){
            dataprovider.loadData('save_config', _params ,_callback);               
        },
        loadMapData: function(_params,_callback){
            dataprovider.loadData('load_data', _params ,_callback);               
        },
        saveMapData:function(_params,_callback){
            dataprovider.loadData('save_data', _params ,_callback);               
        },
        loadData : function(_action,_params,_callback,_isParamsArray) {         
            $.getJSON(settings.datasource,{
                store_id:      settings.store_id,
                action:         _action,
                data:  true == _isParamsArray? JSON.stringify(_params): '[' + JSON.stringify(_params) + ']'
            },function(response){
                //  alert(response);
                if(response){
                    if(response.code == settings.code.ok){
                        _callback.call(this,response.data);
                    }else
                        alert(response.message);
                }else
                    alert('Fatal error: Datasource not available!');
                return null;
            });
        }
    };
 
    var handlers = {
        actionSaveConfig:function(){
            var _data = {};
            var _map_center = datastorage.map.getCenter();
            _data.center = {
                lat:_map_center.lat(),
                lng:_map_center.lng()
            };
            _data.zoom = datastorage.map.getZoom();
            dataprovider.saveMapConfig(_data , function(data){
                alert('Default configuration saved');
            });
        },
        actionUndo:function(){
            var _array = datastorage.undo.doUndo();
            //prevent clear in case of null undo
            if(_array)
                datastorage.markerArrayObject.reloadMarkers(_array);            
        },
        actionSave:function(){
            var _data = {};
            _data.markers = convert.markerArrayToALatLngArray(datastorage.markerArrayObject.markers);
            dataprovider.saveMapData(_data , function(data){
                alert('Delivery region saved');
            });
        },
        actionReset:function(){
            dataprovider.loadMapData({}, function(data){
                //load newest data )
                datastorage.data = data;
                //reset map
                datastorage.map.setOptions(datastorage.mapOptions);
                //reset polygon markers
                datastorage.markerArrayObject.reloadMarkers(datastorage.data.markers);  
                //reset undo
                datastorage.undo.resetUndo();
            });
        },
        actionDeleteCurrentMarker:function(){
            datastorage.undo.addUndo(datastorage.markerArrayObject.markers);
            var _marker = datastorage.markerArrayObject.getCurrentMarker();
            if(_marker){
                datastorage.markerArrayObject.deleteMarker(_marker.getPosition());
                datastorage.markerArrayObject.setCurrentMarker(null);
            }
            datastorage.markerArrayObject.redrawPolygon();
        }
    };
    var helpers = {
        log:function(line){
        //$("#log_here").html($("#log_here").html()+"<br/>"+line);
        },
        init : function( options ) {
            if(!options.datasource ){
                this.html("Plugin configuration not valid. Required datasource");
                return;
            }
            if ( options ) { 
                $.extend( settings, options );
            }
            //error handler #debug!
            $("body").ajaxError(function(event, request, settings){
                alert("Map ajaxError: " + settings.url );
            });
            this.load(settings.templates.main,function(){ 
                //load main data 
                if(settings.config){
                    $("#map_undo_action_button").hide();
                    $("#map_reset_action_button").hide();
                    $("#map_save_action_button").hide();
                    $("#map_delete_action_button").hide();
                    dataprovider.loadMapConfig({}, function(data){
                        datastorage.data = data;
                        helpers.initMap();
                    });
                }else{
                    $("#map_save_config_action_button").hide();
                    dataprovider.loadMapData({}, function(data){
                        datastorage.data = data;
                        helpers.initMarkerArray();
                        helpers.initUndo();
                        helpers.initMap();
                        datastorage.markerArrayObject.reloadMarkers(datastorage.data.markers);
                    // datastorage.undo.addUndo(datastorage.markerArrayObject.markers);
                    });
                }
            });
        },
        initMap:function(){
            datastorage.mapOptions = {
                zoom: datastorage.data.center.zoom,
                center: new google.maps.LatLng(datastorage.data.center.lat,datastorage.data.center.lng),
                mapTypeId: google.maps.MapTypeId.ROADMAP
            }
            datastorage.map = new google.maps.Map(document.getElementById('map_placeholder'),datastorage.mapOptions);
            $("#map_placeholder").width(settings.map.width);
            $("#map_placeholder").height(settings.map.height);
            if(!settings.config){
                google.maps.event.addListener(datastorage.map, 'click', function(event) {
                    if(datastorage.markerArrayObject.markers.length < datastorage.markerArrayObject.max_count)
                        datastorage.undo.addUndo(datastorage.markerArrayObject.markers);
                    datastorage.markerArrayObject.addMarker(event.latLng);
                    datastorage.markerArrayObject.setCurrentMarker(null);
                    datastorage.markerArrayObject.redrawPolygon();
                });
                //set restaurant point
                var restaurant_marker = new google.maps.Marker({
                    position: new google.maps.LatLng(datastorage.data.restaurant.lat,datastorage.data.restaurant.lng),
                    map: datastorage.map,
                    title:"restaurant position"
                });
            }
        },
        initMarkerArray:function(){
            var _markerArray={
                markers:[],
                max_count:8,
                polygonMapObject:null,
                currentMarker:null,
                setCurrentMarker:function(oMarker){
                    var _current_marker = this.currentMarker;
                    if(!oMarker || (oMarker && oMarker == this.currentMarker))
                        this.currentMarker = null;
                    else if(oMarker && oMarker != this.currentMarker){
                        //change current marker
                        oMarker.old_icon = oMarker.getIcon();
                        oMarker.setIcon('../map/images/red_rect_selected.png');
                        this.currentMarker = oMarker;        
                    }
                    if(_current_marker)
                        _current_marker.setIcon(_current_marker.old_icon);
                    
                    //set button visibility
                    if(this.currentMarker){
                        $("#map_delete_action_button").show();
                    }else{
                        $("#map_delete_action_button").hide();
                    }
                },
                getCurrentMarker:function(){
                    return this.currentMarker;
                },
                addMarker:function(oLatLng){
                    if(this.markers.length < this.max_count){                        
                        var _marker = new google.maps.Marker({
                            position: oLatLng,
                            map: datastorage.map,
                            draggable : true,
                            icon: '../map/images/red_rect.png'
                        });           
                        google.maps.event.addListener(_marker, 'mousedown', function(event) { 
                            datastorage.current_markers= datastorage.markerArrayObject.markers;
                        });
                        google.maps.event.addListener(_marker, 'dragstart', function(mouseEvent) {
                            if(datastorage.current_markers){
                                datastorage.undo.addUndo(datastorage.current_markers);                                
                                datastorage.current_markers = null;
                            }
                        });
                        google.maps.event.addListener(_marker, 'mouseup', function(event) {                            
                            datastorage.markerArrayObject.redrawPolygon();
                        });
                        google.maps.event.addListener(_marker, 'click', function(event) {
                            datastorage.markerArrayObject.setCurrentMarker(_marker);
                        });
                        this.markers.push(_marker);
                    }
                },
                reloadMarkers:function(aLatLngArray){
                    this.deleteMarkers();
                    if(aLatLngArray)
                        $.each(aLatLngArray,function(key,value){
                            datastorage.markerArrayObject.addMarker(new google.maps.LatLng(value.lat,value.lng));
                        });
                    this.setCurrentMarker(null);
                    this.redrawPolygon();
                },
                deleteMarker:function(aLatLng){
                    var _key=-1;
                    //find it
                    if(this.markers)
                        $.each(this.markers,function(keyMarker,valueMarker){
                            if(aLatLng == valueMarker.getPosition()){
                                _key=keyMarker;
                            }
                        }); 
                    //remove by key
                    
                    if(_key!=-1){
                        this.markers[_key].setMap(null);
                        this.markers.splice(_key,1);
                    }
                },
                deleteMarkers:function(){
                    if(this.markers){
                        $.each(this.markers,function(keyMarker,valueMarker){
                            valueMarker.setMap(null);                            
                        });  
                        delete this.markers;
                        this.markers = [];
                    }
                },
                redrawPolygon:function(){
                    if(this.polygonMapObject){
                        this.polygonMapObject.setMap(null);
                        delete this.polygonMapObject;
                        this.polygonMapObject=null;
                    }
                    this.changeIcons(this.markers);
                    if(this.markers.length > 2){
                        //get markers coordinates
                        var _array = convert.markerArrayToLatLngArray(this.markers);
                        var _polygon = new google.maps.Polygon({
                            paths: _array,
                            strokeColor: "#f00",
                            strokeOpacity: 0.8,
                            strokeWeight: 2,
                            fillColor: "#f00",
                            fillOpacity: 0.35
                        });
                        _polygon.setMap(datastorage.map);
                        this.polygonMapObject = _polygon;
                    }
                },
                changeIcons:function(markerArray){
                    var aLatLng = [];
                    if(markerArray)
                        $.each(markerArray,function(key,value){
                            if(0==key)
                                value.setIcon('../map/images/red_rect_dot.png');
                            else if(markerArray.length - 1 == key)
                                value.setIcon('../map/images/red_rect_dot.png');
                            else
                                value.setIcon('../map/images/red_rect.png');
                        });                    
                }
            }  
            datastorage.markerArrayObject = _markerArray;
        },
        initUndo:function(){
            var _undo={
                currentIndex:-1,
                snapshotList:[],
                reloadPanel:function(){
                    if(this.currentIndex >= 0){
                        $("#map_undo_action_button").show();
                    }else{
                        $("#map_undo_action_button").hide();
                    }
                },
                addUndo:function(aListMarkers){
                    if(aListMarkers && aListMarkers.length > 0){                       
                        helpers.log("Add undo line");
                        var _local = convert.markerArrayToALatLngArray(aListMarkers);
                        //cut old 
                        this.snapshotList.push(_local);
                        //cut
                        if(this.snapshotList.length > 50){
                            this.snapshotList.shift();
                        }
                        this.currentIndex = this.snapshotList.length - 1;
                        this.reloadPanel();
                    }
                },
                resetUndo:function(){
                    if(this.snapshotList)
                        for(_item in this.snapshotList){
                            delete _item;
                        }
                    this.snapshotList= [];
                    this.currentIndex = -1;
                    helpers.log("Undo reset.Index:"+this.currentIndex+" In:"+this.snapshotList.length);
                    this.reloadPanel();
                },
                doUndo:function(){
                    if(this.currentIndex!=-1){
                        helpers.log("do undo index :"+this.currentIndex);
                        this.currentIndex = this.currentIndex - 1;
                        this.reloadPanel();
                        return this.snapshotList.pop();
                    }
                    return null;
                }
            };
            datastorage.undo =  _undo;   
            _undo.reloadPanel();
        }
    };
    var convert = {
        markerArrayToLatLngArray:function (markerArray){
            var aLatLng = [];
            $.each(markerArray,function(key,value){
                aLatLng.push(value.getPosition());
            });
            return aLatLng;
        },
        markerArrayToALatLngArray:function (markerArray){
            var aLatLng = [];
            $.each(markerArray,function(key,value){
                aLatLng.push({
                    lat:value.getPosition().lat(),
                    lng:value.getPosition().lng()
                });
            });
            return aLatLng;
        }
    }
    
    //
    //          PLUGIN ACCESS POINT
    //          
    $.fn.makiMap = function(method) {
        if ( handlers[method] ) {
            return handlers[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
        } else if ( typeof method === 'object' || ! method ) {
            return helpers.init.apply( this, arguments );
        } else {
            $.error( 'Method ' +  method + ' does not exist on jQuery.makiMap' );
        }   
    };
    
})( jQuery );

// $.tmpl(data).appendTo( obj );