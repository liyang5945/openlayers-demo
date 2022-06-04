<template>
  <div class="map-wrapper">
    <div id="map"></div>
    <div id="popup" class="ol-popup">
      <a href="#" id="popup-closer" class="ol-popup-closer"></a>
      <div id="popup-content"></div>
    </div>
    <div class="manager-box">
      <el-button type="primary" @click="addTrackPath">显示历史轨迹</el-button>
      <el-button type="primary" @click="changeLineStyle">改变线样式</el-button>
      <el-button type="primary" @click="changePolygonStyle">改变区域样式</el-button>
      <el-button type="primary" @click="startDraw('Point')">绘制点</el-button>
      <el-button type="primary" @click="startDraw('LineString')">绘制线条</el-button>
      <el-button type="primary" @click="startDraw('Polygon')">绘制图形</el-button>
      <el-button type="primary" @click="toggleAnimation">显示运动轨迹</el-button>
      <el-button type="primary" @click="toggleMapSource">切换图层</el-button>
    </div>
    <div v-if="visibleMarkerList.length">
      <div class="marker-item"
           v-contextmenu:markerContextmenu
           v-for="item in visibleMarkerList"
           :key="item.name"
           :style="{
            position: 'absolute',
            left:item.left+'px',
            top:item.top+'px',
        }"
      >
        <img :style="{
        transform: `translate(-50%,-50%) rotate(${item.rotation}deg)`
      }" :src="'img/arrow-up.png'" alt="">
        <p class="marker-name">{{ item.name }}</p>
      </div>
    </div>

    <!--html图标右键菜单-->
    <v-contextmenu ref="markerContextmenu" @contextmenu.stop.prevent.native>
      <v-contextmenu-item class="right-menu-item" @click="addTrackPath">显示轨迹</v-contextmenu-item>
    </v-contextmenu>

    <!--地图feature图标右键菜单-->
    <v-contextmenu ref="featureContextmenu" @contextmenu.stop.prevent.native>
      <v-contextmenu-item class="right-menu-item">右键菜单1</v-contextmenu-item>
      <v-contextmenu-item class="right-menu-item" @click="deleteFeature">删除</v-contextmenu-item>
    </v-contextmenu>

  </div>
</template>
<script>

import dayjs from 'dayjs'

import {arrowSvgPath, markerData, markerSvg, trackData, trackData1} from '@/mock-data/data-template.js'

import {bearing as bearingFunc, point as turfPoint} from '@turf/turf'

import polylineTool from '@/utils/polyline.js'
// openlayers 模块
import Draw from "ol/interaction/Draw"
import Map from "ol/Map"
import View from "ol/View"
import Feature from 'ol/Feature'
import Overlay from 'ol/Overlay'

import XYZ from 'ol/source/XYZ'


import {LineString, Point, Polygon,} from 'ol/geom'
import {Vector as VectorSource} from "ol/source"
import {Tile as TileLayer, Vector as VectorLayer} from "ol/layer"
import Polyline from 'ol/format/Polyline';
import {getVectorContext} from 'ol/render';
import {Circle as CircleStyle, Fill, Icon, Stroke, Style, Text} from "ol/style"
import GeoJSON from "ol/format/GeoJSON"
import {fromLonLat, toLonLat} from 'ol/proj'


const polyline = polylineTool.encode(trackData1.map(item => {
  return [item[1].toFixed(6), item[0].toFixed(6)]
}), 6)
const route = new Polyline({
  factor: 1e6,
}).readGeometry(polyline, {
  dataProjection: 'EPSG:4326',
  featureProjection: 'EPSG:3857',
});

const position = new Point(route.getFirstCoordinate())
const geoMarker = new Feature({
  type: 'geoMarker',
  geometry: position,
});


let animating = false;
let rotation = -90 * Math.PI / 180;
let distance = 0;
let lastTime;


export default {
  data() {
    return {
      mapData: null,
      DrawVar: null,
      baseLayer: null,
      areaVectorLayer: null,
      arcgisMapSource: null,
      autonaviMapSource: null,
      drawVectorSource: null,
      areaVectorSource: null,
      trackVectorSource: null,
      trackVectorLayer: null,
      markerList: markerData,
      visibleMarkerList: [],
      currentFeature: null,
      mapSourceIndex: 0
    }
  },
  mounted() {
    this.initMap();
  },
  methods: {
    initMap() {
      this.arcgisMapSource = new XYZ({
        ratio: 1,
        params: {
          isBaseLayer: true,
          visibility: true,
          projection: 'EPSG:3857',
          format: "image/png"
        },
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      })

      this.autonaviMapSource = new XYZ({
        ratio: 1,
        params: {
          isBaseLayer: true,
          visibility: true,
          projection: 'EPSG:3857',
          format: "image/png"
        },
        url: 'http://webrd03.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}&lang=zh_cn',
      })

      this.baseLayer = new TileLayer({
        source: this.arcgisMapSource
      })

      this.areaVectorSource = new VectorSource()
      this.trackVectorSource = new VectorSource()

      this.areaVectorLayer = new VectorLayer({
        source: this.areaVectorSource,
      })

      this.trackVectorLayer = new VectorLayer({
        source: this.trackVectorSource,
      })

      const container = document.getElementById('popup');
      const content = document.getElementById('popup-content');
      const closer = document.getElementById('popup-closer');
      closer.onclick = function () {
        overlay.setPosition(undefined);
        closer.blur();
        return false;
      }

      var overlay = new Overlay({
        element: container,
        positioning: 'bottom-center',
        stopEvent: false,
        offset: [0, -10]
      })

      this.mapData = new Map({
        layers: [
          this.baseLayer,
          this.areaVectorLayer,
          this.trackVectorLayer,
        ],
        overlays: [overlay],
        target: "map",
        view: new View({
          center: fromLonLat([121.49309680, 31.18520803]),
          zoom: 10,
          maxZoom: 20,
        })
      });


      const that = this
      this.mapData.on('click', function (evt) {
        var feature = that.mapData.forEachFeatureAtPixel(evt.pixel,
            function (feature) {
              return feature
            }
        )
        if (feature) {
          const coordinate = evt.coordinate
          const featureProperties = feature.getProperties()
          if (['marker', 'line', 'area', 'trackPoint'].includes(featureProperties.type)) {
            overlay.setPosition(coordinate)
            that.showPopup(content, featureProperties)
          }
        } else {
          overlay.setPosition(undefined);
        }
      })

      this.mapData.getViewport().addEventListener('contextmenu', evt => {
        evt.preventDefault();
        var feature = that.mapData.forEachFeatureAtPixel(that.mapData.getEventPixel(evt),
            function (feature) {
              return feature
            }
        )
        const menuPosition = {
          left: evt.clientX,
          top: evt.clientY
        }
        if (feature) {
          const featureProperties = feature.getProperties()
          console.log(feature, featureProperties);
          that.$refs.featureContextmenu.show(menuPosition)
          this.currentFeature = feature
        } else {
        }
      })

      this.drawMarker();
      this.drawLineString();
      this.drawPolygon();
      this.addHtmlMarker();
      this.addAnimateMarker();
    },
    deleteFeature() {
      this.areaVectorSource.removeFeature(this.currentFeature)
    },
    /*显示弹层*/
    showPopup(element, props) {
      console.log(props);
      if (props.type == 'trackPoint') {
        element.innerHTML = `<div class="popup-info">
          <p>${props.name}</p>
          <p>时间：${dayjs(props.time).format('HH:mm:ss')}</p>
          <p>速度：${props.speed}km/h</p>
        </div>`
      } else {
        element.innerHTML = `<div class="popup-info">
          <p>${props.name}</p>
        </div>`
      }
    },
    /*根据已有坐标绘制点*/
    drawMarker() {
      let iconFeature = new Feature({
        geometry: new Point(fromLonLat([121.49309680, 31.18520803])),
        name: '标记1 svg', // name和type是我自己加的属性，也可以用别的
        type: 'marker',
      })
      let iconStyle = new Style({
        text: new Text({
          font: '16px sans-serif ',
          text: '标记1',
          offsetY: 25,
          fill: new Fill({
            color: '#FF0000'
          }),
        }),
        image: new Icon({
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          // src: 'data:image/svg+xml;utf8,' + markerSvg,
          src: 'data:image/svg+xml;utf8,' + escape(markerSvg),
          imgSize: [32, 32],
          rotateWithView: true,
        }),
      })
      iconFeature.setStyle(iconStyle)
      this.areaVectorSource.addFeature(iconFeature)

      let iconFeature1 = new Feature({
        geometry: new Point(fromLonLat([121.69840380683587, 31.139965591074088])),
        name: '标记2 png 旋转45度',
        type: 'marker',
      })
      let iconStyle1 = new Style({
        text: new Text({
          font: '16px sans-serif ',
          text: '标记2',
          offsetY: 25,
          fill: new Fill({
            color: '#FF0000'
          }),
        }),
        image: new Icon({
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          src: 'img/arrow-up.png',
          imgSize: [32, 32],
          rotateWithView: true,
          rotation: Math.PI / 180 * 45 //  旋转角度，单位弧度
        }),
      })
      iconFeature1.setStyle(iconStyle1)
      this.areaVectorSource.addFeature(iconFeature1)


    },
    /*已有坐标绘制线*/
    drawLineString() {
      const linePoints = [[121.56794116035155, 31.560996120782647], [121.45121142402344, 31.518860903482263], [121.45395800605469, 31.432189936615572], [121.47181078925782, 31.382962620417374], [121.56107470527343, 31.41578370076762], [121.5981535626953, 31.44390691899946], [121.65995165839841, 31.41578370076762], [121.6970305158203, 31.360684638818043], [121.73548266425782, 31.310246553689936], [121.74509570136718, 31.27025111578449], [121.80552050605466, 31.22915949137321]]
      const lineFeature = new Feature({
        geometry: new LineString(linePoints.map(item => fromLonLat(item))),
        name: 'line1', //添加的自定义属性
        type: 'line', //添加的自定义属性
      })

      let lineStyle = new Style({
        fill: new Fill({
          color: "rgba(255, 0, 0, 0.2)"
        }),
        stroke: new Stroke({
          color: "rgba(255, 0, 0, 1)",
          width: 3
        }),
      })

      lineFeature.setStyle(lineStyle);

      this.areaVectorSource.addFeature(lineFeature)

    },
    /*已有坐标绘制多边形*/
    drawPolygon() {
      const areaPoints = [
        [121.08591601386718, 31.401718928713294],
        [120.98154589667966, 31.324325017677936],
        [121.00077197089843, 31.183445742082455],
        [121.12848803535154, 31.156419886568287],
        [121.21500536933593, 31.219859690525922],
        [121.20401904121093, 31.355993864491595],
        [121.08591601386718, 31.401718928713294]
      ]
      const areaFeature = new Feature({
        geometry: new Polygon([areaPoints.map(item => fromLonLat(item))]),
        name: 'area1', //添加的自定义属性
        type: 'area', //添加的自定义属性
      })

      let areaStyle = new Style({
        fill: new Fill({
          color: "rgba(0, 128, 0, 0.2)"
        }),
        stroke: new Stroke({
          color: "green",
          width: 2
        }),
      })
      areaFeature.setStyle(areaStyle)
      this.areaVectorSource.addFeature(areaFeature)
    },

    changeLineStyle() {
      let features = this.areaVectorSource.getFeatures()
      features.forEach(item => {
        let type = item.getProperties().type
        if (type && type == 'line') {
          const style = new Style({
            fill: new Fill({
              color: "rgb(255,0,0)"
            }),
            stroke: new Stroke({
              color: "#5D2DCC",
              width: 3
            }),
          })
          item.setStyle(style)
        }
      })
    },
    changePolygonStyle() {
      let features = this.areaVectorSource.getFeatures()
      features.forEach(item => {
        let type = item.getProperties().type
        if (type && type == 'area') {
          const style = new Style({
            fill: new Fill({
              color: "rgba(255,0,0,.5)"
            }),
            stroke: new Stroke({
              color: "rgb(85,9,178)",
              width: 3
            }),
          })
          item.setStyle(style)
        }
      })
    },

    startDraw(type) {
      // 新建绘制对象
      this.DrawVar = new Draw({
        source: this.areaVectorSource,
        type: type,
        stopClick: true
      })
      // 添加交互
      this.mapData.addInteraction(this.DrawVar)

      // 监听绘制结束事件
      this.DrawVar.on("drawend", (evt) => {

        const {geometry} = JSON.parse(new GeoJSON().writeFeature(evt.feature))
        //打印手动绘制图形的坐标，并设置手动绘制图形的样式，注意：多边形的坐标比线条多嵌套一层，要这样取：geometry.coordinates[0]

        if (type == "Point") {
          console.log(JSON.stringify(toLonLat(geometry.coordinates)));
          evt.feature.setStyle(new Style({
            text: new Text({
              font: '16px sans-serif ',
              text: 'Point',
              offsetY: 25,
              fill: new Fill({
                color: '#FF0000'
              }),
            }),
            image: new Icon({
              anchor: [0.5, 0.5],
              anchorXUnits: 'fraction',
              anchorYUnits: 'fraction',
              src: 'data:image/svg+xml;utf8,' + escape(markerSvg),
              imgSize: [32, 32],
              rotateWithView: true,
            }),
          }))
        } else if (type == "LineString") {
          console.log(JSON.stringify(geometry.coordinates.map(item => toLonLat(item))));
          evt.feature.setStyle(new Style({
            stroke: new Stroke({
              color: "rgb(18,150,219)",
              width: 3
            }),
          }))
        } else if (type == "Polygon") {
          console.log(JSON.stringify(geometry.coordinates[0].map(item => toLonLat(item))));
          evt.feature.setStyle(new Style({
            fill: new Fill({
              color: "rgba(255,0,0,.5)"
            }),
            stroke: new Stroke({
              color: "rgb(18,150,219)",
              width: 3
            }),
          }))
        }
        // 移除交互
        this.mapData.removeInteraction(this.DrawVar)
      })
    },
    /* 获取屏幕坐标*/
    getScreePoint(item) {
      if (this.mapData) {
        return this.mapData.getPixelFromCoordinate(fromLonLat([item.lon, item.lat]))
      } else {
        return [-50, -50]
      }
    },
    setCurrentPosition(markerItem) {
      let targetItem = this.markerList.find(item => markerItem.name == item.name)
      let screenPoint = this.getScreePoint(markerItem)
      targetItem['left'] = screenPoint[0];
      targetItem['top'] = screenPoint[1];
      targetItem['timeDiff'] = new Date().getTime() - new Date(markerItem.time).getTime()
      targetItem['rotation'] = markerItem.rotation;
      this.visibleMarkerList = this.markerList.filter(item => item.timeDiff < 300 * 1000)
    },
    addHtmlMarker() {
      const that = this

      function fakeTrackData(name, trackList) {
        let trackIndex = 0, len = trackList.length
        setInterval(() => {

          let point = trackList[trackIndex]
          let nextPoint = trackList[trackIndex + 1]
          let bearing = bearingFunc(turfPoint(point), turfPoint(nextPoint))
          const markerItem = {
            name: name,
            time: new Date().getTime(),
            rotation: bearing,
            speed: `50km/h`,
            lon: point[0],
            lat: point[1]
          }
          that.setCurrentPosition(markerItem)
          trackIndex += 1
          if (trackIndex >= len - 2) {
            trackIndex = 0
          }
        }, 1500)
      }

      fakeTrackData("车辆3", trackData)
    },
    addTrackPath() {
      const trackPoints = trackData.map(item => {
        return {
          lon: item[0],
          lat: item[1],
          speed: 50,
          time: new Date()
        }
      })
      const featureList = []
      const len = trackPoints.length
      /* 画轨迹点, 并在起始点添加文字*/
      trackPoints.forEach((item, index) => {
        let pointObj = {
          type: 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': fromLonLat([item.lon, item.lat]),
          },
          properties: {
            'name': `轨迹点${index+1}`,
            'type': 'trackPoint',
            'speed': item.speed,
            'time': item.time
          }
        }
        let pointStyle = new Style({
          image: new CircleStyle({
            radius: 4,
            fill: new Fill({
              color: '#32E08D',
            }),
          }),
        })

        if (index === 0) {
          pointStyle = new Style({
            text: new Text({
              font: '14px sans-serif ',
              text: '起',
              offsetY: -10,
              fill: new Fill({
                color: '#32E08D'
              })
            }),
            image: new CircleStyle({
              radius: 4,
              fill: new Fill({
                color: '#1466E0',
              }),
            }),
          })
        }

        if (index === len - 1) {
          pointStyle = new Style({
            image: new CircleStyle({
              radius: 4,
              fill: new Fill({
                color: '#E01430',
              }),
            }),
            text: new Text({
              font: '14px sans-serif ',
              text: '终',
              offsetY: -10,
              fill: new Fill({
                color: '#E01430'
              })
            }),
          })
        }
        const pointFeature = new GeoJSON().readFeature(pointObj)
        pointFeature.setStyle(pointStyle)
        featureList.push(pointFeature)
      })

      /* 画轨迹线*/
      const polyline = polylineTool.encode(trackPoints.map(item => {
        return [item.lat.toFixed(6), item.lon.toFixed(6)]
      }), 6)
      const route = new Polyline({
        factor: 1e6,
      }).readGeometry(polyline, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });

      const routeFeature = new Feature({
        type: 'route',
        geometry: route,
      });

      const routeStyle = new Style({
        stroke: new Stroke({
          color: '#32E08D',
          width: 3,
        }),
        fill: new Fill({
          color: 'rgba(0, 0, 255, 0.1)',
        }),
      })
      routeFeature.setStyle(routeStyle)
      featureList.push(routeFeature)
      this.trackVectorSource.addFeatures(featureList)
    },

    addAnimateMarker() {

      /* 画轨迹线*/
      const polyline = polylineTool.encode(trackData1.map(item => {
        return [item[1].toFixed(6), item[0].toFixed(6)]
      }), 6)
      const route = new Polyline({
        factor: 1e6,
      }).readGeometry(polyline, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });

      const routeFeature = new Feature({
        type: 'route',
        geometry: route,
      });

      const routeStyle = new Style({
        stroke: new Stroke({
          color: '#10854E',
          width: 3,
        }),
        fill: new Fill({
          color: 'rgba(0, 0, 255, 0.1)',
        }),
      })
      routeFeature.setStyle(routeStyle)
      this.trackVectorSource.addFeature(routeFeature)
      geoMarker.setStyle(
          new Style({
            image: new Icon({
              anchor: [0.5, 0.5],
              anchorXUnits: 'fraction',
              anchorYUnits: 'fraction',
              src: 'data:image/svg+xml;utf8,' + arrowSvgPath,
              imgSize: [32, 32],
              // rotation: -rotation - 90 * Math.PI / 180
            }),
          })
      )
      this.trackVectorSource.addFeature(geoMarker)
    },
    startAnimation() {
      animating = true;
      lastTime = Date.now();
      this.trackVectorLayer.on('postrender', this.moveFeature);
      // hide geoMarker and trigger map render through change event
      geoMarker.setGeometry(null);
    },
    stopAnimation() {
      animating = false;

      // Keep marker at current animation position
      geoMarker.setGeometry(position);
      geoMarker.setStyle(new Style({
        image: new Icon({
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          src: 'data:image/svg+xml;utf8,' + arrowSvgPath,
          imgSize: [32, 32],
          rotation: -rotation - 90 * Math.PI / 180
        }),
      }))
      this.trackVectorLayer.un('postrender', this.moveFeature);
    },

    moveFeature(event) {
      function getRotation(prev, next) {
        const dx = prev[0] - next[0]
        const dy = prev[1] - next[1]
        return Math.atan2(dy, dx)
      }

      const speed = 150;
      const time = event.frameState.time;
      const elapsedTime = time - lastTime;
      distance = (distance + (speed * elapsedTime) / 1e6) % 2;
      lastTime = time;

      let realDistance = distance > 1 ? distance - 1 : distance
      const currentCoordinate = route.getCoordinateAt(
          realDistance
      );

      const nextCoordinate = route.getCoordinateAt(Math.min(realDistance + 0.0001, 1))

      rotation = getRotation(currentCoordinate, nextCoordinate)

      position.setCoordinates(currentCoordinate);
      const vectorContext = getVectorContext(event);
      vectorContext.setStyle(new Style({
        image: new Icon({
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          src: 'data:image/svg+xml;utf8,' + arrowSvgPath,
          imgSize: [32, 32],
          rotation: -rotation - 90 * Math.PI / 180
        }),
      }));
      vectorContext.drawGeometry(position);
      this.mapData.render();
    },

    toggleAnimation() {
      if (animating) {
        this.stopAnimation();
      } else {
        this.startAnimation();
      }
    },
    toggleMapSource() {
      this.mapSourceIndex = !this.mapSourceIndex
      this.mapSourceIndex ? this.baseLayer.setSource(this.autonaviMapSource) : this.baseLayer.setSource(this.arcgisMapSource)
    },
    // 清除轨迹
    clearTrack() {
      this.trackVectorSource.clear()
    },

  }
}
</script>
