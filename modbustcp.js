
/**
 * Original Work Copyright 2015 Valmet Automation Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modified work Copyright 2016 Argonne National Laboratory.
 *
 * Licensed under the the BSD 3-Clause License (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

//@ts-check

//import { numdouble, numfloat} from './helpers';
// import { timestamp, log as timestamplog, calcRate} from './helpers';

let helpers = require('./helpers');

let numdouble = helpers.numdouble;
let numfloat = helpers.numfloat;
let timestamplog = helpers.log;
let calcRate = helpers.calcRate;

//import * as emitter from 'events';
let emitter = require('events');
let compver = require('compare-versions');

module.exports = function(RED) {
  let Modbus = require("jsmodbus");
  let net = require('net');
  let util = require("util");
  
  let debug = require('debug')('anl:node-red-modbustcp');
  
  process.on('uncaughtException',(err) => {
    console.log(`Uncaught Exception: ${err.name}`);
    console.log(`Stack: ${err.stack}`);
  });
  
  
  function ModbusTCPServerNode(config) {
    RED.nodes.createNode(this, config);
    this.host = config.host;
    this.port = config.port;
    this.reconnect = config.reconnect;
    this.reconnecttimeout = config.reconnecttimeout;
    this.unit_id = config.unit_id;
    this.modbusconn = null;
    
    this._state = 'disconnected';
    
    let Reconnect = require('node-net-reconnect/src/index.js')
    
    let node = this;
    
    //@ts-
    let consettings = {
      host: node.host,
      port: node.port,
    };
    
    let recon;

    node.initializeModbusTCPConnection = function(socket, onConnect,handler) {
      timestamplog( `Connecting to modbustcp slave at ${node.host}:${node.port} unit_id: ${node.unit_id}`);

      if (Number(node.reconnecttimeout) > 0) {
        consettings.autoReconnect = true;
        consettings.reconnectTimeout = Number(node.reconnecttimeout) * 1000;
        consettings.retryAlways = true;
        consettings.retryTime = Number(node.reconnecttimeout) * 1000;
      }
      
      node.modbusconn = new Modbus.client.TCP(socket,Number(node.unit_id));
      
      const _onConnectEvent = () => {
        debug(`socket connected to ${socket.remoteAddress}:${socket.remotePort}`);
        debug(`socket connected from ${socket.localAddress}:${socket.localPort}`)
        
        // Only node >= 9.11.0 will emit a ready, so force a 
        // ready on connect for earlier releases.

        if (compver(process.versions.node,'9.11.0') >= 0){
          this._state = 'connected';
        }
        else{
          this._state = 'ready';
        }

      }
      
      const _onReadyEvent = () => {
        // We only get a 'ready' emitted for 
        // version 9.11.0 of node and higher
        this._state = 'ready';
        debug('socket ready');
      }

      const _onCloseEvent = (hadError) => {
        debug('socket closed. HadError = ', hadError);
        this._state = 'disconnected';
      }
      
      const _onErrorEvent = (err) => {
        node.error(`socket error: ${err.name}: ${err.message}`)
        debug(`socket error: ${err.name}: ${err.message}`)
        this._state = 'error';
        socket.destroy();
        //socket.connect(consettings);
      }
      
      
      const _onTimeoutEvent = () => {
        node.warn('socket timeout');
        debug('socket timeout');
      }
        
      socket.on('connect', _onConnectEvent);
      socket.on('ready', _onReadyEvent);
      socket.on('close', _onCloseEvent);
      socket.on('error', _onErrorEvent);
      socket.on('timeout', _onTimeoutEvent );
    
      recon = new Reconnect(socket,consettings);
    
      socket.connect(consettings);

      handler(node.modbusconn);

      node.on("close", function() {
        timestamplog(`Disconnecting from modbustcp slave at ${socket.remoteAddress}:${socket.remotePort}`);
        socket.removeListener('connect', _onConnectEvent);
        socket.removeListener('ready', _onReadyEvent);
        socket.removeListener('close', _onCloseEvent);
        socket.removeListener('error', _onErrorEvent);
        socket.removeListener('timeout', _onTimeoutEvent );
        recon.end();
      });
  

    };

    node.getState = function() {
      return this._state;
    }

  }

  RED.nodes.registerType("modbustcp-server", ModbusTCPServerNode);

  function ModbusTCPRead(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.topic = config.topic;
    this.dataType = config.dataType;
    this.adr = config.adr;
    this.quantity = config.quantity;
    this.rate = config.rate;
    this.rateUnit = config.rateUnit;
    this.connection = null;
    this.ieeeType = config.ieeeType || 'off';
    //this.ieeeBE = 
    if (config.hasOwnProperty('ieeeBE')) {
      this.ieeeBE = (config.ieeeBE === "true");
    }
    else{
      this.ieeeBE = true;
    }

    const _DISCONNECTED = 0;
    const _CONNECTED = 1;
    const ee = new emitter.EventEmitter();

    let socket = new net.Socket();

    let bigArray = [];

    var node = this;

    var modbusTCPServer = RED.nodes.getNode(config.server);

    // Timers
    let timerID; // used for single node (non-inject) modbus event
    let timers = {}; // used as a collection of running timers externally injected

    node.onCloseEvent = function() {
      timestamplog(node.name + " was disconnected or was unable to connect");
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
      clearInterval(timerID);
      timerID = null;
    };

    node.onConnectEvent = function() {
    };

    node.onReadyEvent = function(){

      let settings = {
        name: node.name || "",
        topic: node.topic || node.name,
        adr: node.adr,
        quantity: node.quantity,
        dataType: node.dataType,
        ieeeType: node.ieeeType,
        ieeeBE: node.ieeeBE
      };
      node.status({
        fill: "green",
        shape: "dot",
        text: "Connected"
      });

      ee.once('flush',flushArray);

      clearInterval(timerID);
      timerID = null;

      // Ignore standalone mode if rate is 0 and wait for flow input
      if (node.rate != 0){

        if (modbusTCPServer.getState() === 'ready'){
          bigArray.push(settings);
          ee.emit('flush');
          //ModbusMaster(settings); //fire once at start
        }
        else debug("socket state: %s",modbusTCPServer.getState());

        if (!timerID) {
          timerID = setInterval(function() {
            settings.timerID = timerID;
            if (modbusTCPServer.getState() === 'ready'){
              bigArray.push(settings);
              ee.emit('flush');
              //ModbusMaster(settings);
            }
            else debug("socket state: %s",modbusTCPServer.getState());
            }, calcRate(node.rate, node.rateUnit));
        }
  
      }
            
    }; //onReadyEvent

    if (compver(process.versions.node,'9.11.0') >= 0){
      socket.on("connect", node.onConnectEvent);
    } else {
      socket.on("connect", node.onReadyEvent);
    }

    socket.on("ready", node.onReadyEvent);
    socket.on("close", node.onCloseEvent);

    modbusTCPServer.initializeModbusTCPConnection(socket, node.onConnectEvent,function(connection) {
      node.connection = connection;
      node.status({ fill: "blue", shape: "dot", text: "Initiating....." });
    });

    node.on("close", function() {
      timestamplog(node.name + ":" + "Closing");

      clearInterval(timerID);
      timerID = null;

      for (var property in timers){
        if (timers.hasOwnProperty(property)){
          clearInterval(timers[property]);
        }
      }
   
      if (compver(process.versions.node,'9.11.0') >= 0){
        socket.removeListener("connect", node.onConnectEvent);
      } else {
        socket.removeListener("connect", node.onReadyEvent);
      }
      socket.removeListener("close", node.onCloseEvent);
      socket.removeListener("ready", node.onReadyEvent);
      //socket.end();
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
      //socket.close();
    });

    node.on("input", msg => {

      if (msg.hasOwnProperty('kill') && msg.kill === true){
        if (msg.hasOwnProperty('payload') && msg.payload.hasOwnProperty('name') && msg.payload.name ){
          if (timers.hasOwnProperty(msg.payload.name)){
            clearInterval(timers[msg.payload.name]);
          }
        }
        return;
      }

      const SetupLoop = (params) => {
        // console.log('Starting Loop', params.name);

        if (!params.hasOwnProperty('values')){
          // has no values array, so create one;
          params.values = [{
            address: params.address,
            quantity: params.quantity,
            dataType: params.dataType,
          }];
          
          if (params.hasOwnProperty('topic')){
            params.values[0].topic = params.topic;
          }
          
          if (params.hasOwnProperty('name')){
            params.values[0].name = params.name;
          }
          if (params.hasOwnProperty('ieeeType')){
            params.values[0].ieeeType = params.ieeeType;
          }
          if (params.hasOwnProperty('ieeeBE')){
            params.values[0].ieeeBE = params.ieeeBE;
          }
          
        }

        async function processValues(values, name, interval){

          values.forEach( value => {

            let settings = {
              name: value.name || name || "",
              interval,
              topic: value.topic || msg.topic || node.topic || node.name,
              adr: value.address || node.adr,
              quantity: value.quantity || node.quantity,
              dataType: value.dataType || node.dataType,
              ieeeType: value.ieeeType || node.ieeeType,
              ieeeBE: node.ieeeBE
            };

            if (value.hasOwnProperty('ieeeBE') && util.isBoolean(value.ieeeBE)){
              settings.ieeeBE = value.ieeeBE;
            }


            // only attempt to read if the connection is ready
            if (modbusTCPServer.getState() === 'ready'){
              bigArray.push(settings);
              ee.emit('flush');
              // ModbusMaster(settings); 
            }
            else debug("socket state: %s",modbusTCPServer.getState());

          });

        }

        if (params.name && timers.hasOwnProperty(params.name)){
          // console.log('clearing old time',params.name);
          clearInterval(timers[params.name]);
        }

        processValues(params.values, params.name, params.interval);

        let loopId = setInterval(function() {
          //params.values.timerID = loopId;
          processValues(params.values, params.name, params.interval);
          //ModbusMaster(settings);
        }, params.interval || calcRate());
  
        if (params.name){
          timers[params.name] = loopId;
          // console.log("Timers:", params.name);
        }
      }

      let p = msg.payload;

      // If the payload is an array of requests, loop each one and send it,
      // otherwise send just the single payload.
      //
      if (p.length > 0){
        p.forEach(p => SetupLoop(p));
      }
      else{
        SetupLoop(p);
      }
      
    });
    

    async function flushArray() {
      try {
        while(bigArray.length > 0){
          let settings = bigArray.pop();
          await ModbusMaster(settings);
        }
        ee.once('flush', flushArray);
      }
      catch(err){
        let ts = new Date();
        let errStr = util.inspect(err);
        node.error(`${ts.toLocaleString()} Error: ${errStr}`);
      }
    }

    async function ModbusMaster(settings) {
      var msg = {};
      let resp;

      const address = Number(settings.adr);
      const quantity = Number(settings.quantity);

      msg.settings = settings;
      msg.topic = settings.topic;

      // Do nothing if we are not connected
      if (modbusTCPServer.getState() !== 'ready') return;
      
      set_connected_polling(settings.dataType);
      switch (settings.dataType) {
        // accept either a #, a name (Coil), or an FC string (FC1, FC 1)
        // (Maybe should do case insensitive compare?)
        //
        case 1:
        case "FC1":
        case "FC 1":
        case "Coil": //FC: 1
          try{
            resp = await node.connection.readCoils(address, quantity)
            set_connected_waiting();
            msg.payload = resp.response.body.valuesAsArray.map( (val) => { return (val == 1) });
            node.send(msg);
          }
          catch(e) {
              modbus_error_check(e);
              console.error(e);
          };
          break;
        case 2:
        case "FC2":
        case "FC 2":
        case "Input": //FC: 2
          try{
            resp = await node.connection.readDiscreteInputs(address, quantity);
            set_connected_waiting();
                // msg.payload = resp.coils; // array of discrete input values
            msg.payload = resp.response.body.valuesAsArray.map( (val) => { return (val == 1) });
            node.send(msg);
          }catch(e) {
              modbus_error_check(e);
              console.error(e);
          };            
          break;
        case 3:
        case "FC3":
        case "FC 3":            
        case "HoldingRegister": //FC: 3
          try{
            resp = await node.connection.readHoldingRegisters(address, quantity);
            set_connected_waiting();
            // console.log('settings:', settings.ieeeType);
            // console.log('Big End: ', settings.ieeeBE);
            switch(settings.ieeeType){
              case 'single':
                msg.payload = numfloat(resp.response.body.valuesAsArray, settings.ieeeBE);
                break;
              case 'double':
                msg.payload = numdouble(resp.response.body.valuesAsArray, settings.ieeeBE);
                break;
              case 'off':
              default:
                msg.payload = resp.response.body.valuesAsArray; // array of register values
                break;
            }
            node.send(msg);
          }
          catch(e) {
            modbus_error_check(e);
            console.error(e);
          };
          break;
        case 4:
        case "FC4":
        case "FC 4":
        case "InputRegister": //FC: 4
          try{
            resp = await node.connection.readInputRegisters(address, quantity);
            set_connected_waiting();
            switch(settings.ieeeType){
              case 'single':
                msg.payload = numfloat(resp.response.body.valuesAsArray, settings.ieeeBE);
                break;
              case 'double':
                msg.payload = numdouble(resp.response.body.valuesAsArray, settings.ieeeBE);
                break;
              case 'off':
              default:
                msg.payload = resp.response.body.valuesAsArray; // array of register values
                break;
            }
            node.send(msg);
          }
          catch(e) {
            modbus_error_check(e);
            console.error(e);
          };
          break;
        default:
          node.status({ fill: "red", shape: "dot", text: `Invalid FC: ${settings.dataType}` });
          debug(`Invalid FC: ${settings.dataType}`);
          break;   
      }
    }

    //////////////////////////////////////////////////////////
    // Set Node Status indicators
    //


    function set_connected_waiting() {
      node.status({
        fill: "green",
        shape: "dot",
        text: "Connected" 
      });
    }

    function set_connected_polling(fcType) {
      node.status({ 
        fill: "yellow", 
        shape: "dot", 
        text: `Polling: ${fcType}` 
      });
    }

    function modbus_error_check(err) {
      if (err) {
        node.status({ 
          fill: "red", 
          shape: "dot", 
          text: "Error" 
        });
        
        timestamplog(err);
        
        node.error("ModbusTCPClient: " + JSON.stringify(err));
        socket.emit('error',{err: 'local error', message: 'Locally emitted error'});
        return false;
      }
      return true;
    }
    
    //
    // END: Set Node Status indicators
    //////////////////////////////////////////////////////////

  }

  RED.nodes.registerType("modbustcp-read", ModbusTCPRead);


  function ModbusTCPWrite(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.dataType = config.dataType;
    this.adr = Number(config.adr);
    this.quantity = config.quantity;
    var node = this;
    var modbusTCPServer = RED.nodes.getNode(config.server);
    let socket = new net.Socket();

    node.onCloseEvent = function() {
      timestamplog(`${node.name} was Disconnected`);
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
    };

    node.onConnectEvent = function() {
      node.status({ fill: "green", shape: "circle", text: "Connected" });
    };

    node.onReadyEvent = function() {
      node.status({fill: "green", shape: "dot", text: "Ready"})
    }

    socket.on("connect", node.onConnectEvent);
    socket.on("close", node.onCloseEvent);
    socket.on('ready', node.onReadyEvent);
    

    modbusTCPServer.initializeModbusTCPConnection(socket,node.onConnectEvent,function(connection) {
      node.connection = connection;
    });

    function set_successful_write(resp) {
      node.status({
        fill: "green",
        shape: "dot",
        text: "Successfully Written"
      });
    }

    function modbus_error_check(err) {
      if (err) {
        node.status({ fill: "red", shape: "dot", text: "Error" });
        timestamplog(err);
        node.error(node.name + ": " + JSON.stringify(err));
        return false;
      }
      return true;
    }

    node.on("input", msg => {
      let address;
      let dataType;

      if (!(msg && msg.hasOwnProperty("payload"))) return;

      if (msg.payload == null) {
        node.error(node.name + ": Invalid msg.payload!");
        return;
      }

      // Check to see if the incoming message overrides the address
      if (msg.hasOwnProperty("address") && !isNaN(msg.address)) {
        address = Number(msg.address);
      } else {
        address = node.adr;
      }

      // Check to see if the incoming message overrides the dataTpye
      if (msg.hasOwnProperty("dataType") ) {
        dataType = msg.dataType;
      } else {
        dataType = node.dataType;
      }

      node.status({});

      switch (dataType) {
        case 5:
        case "FC5":
        case "FC 5":
        case "Coil": //FC: 5
          debug('Writting Coil: ', msg.payload);
          node.connection
            .writeSingleCoil(address, Number(msg.payload))
            .then(function(resp) {
                set_successful_write(resp);
            }).catch( function(e) {
              modbus_error_check(e);
              console.error(e);
            });
          break;
        case 6:
        case "FC6":
        case "FC 6":
        case "HoldingRegister": //FC: 6
          node.connection
            .writeSingleRegister(address, Number(msg.payload))
            .then(function(resp) {
              set_successful_write(resp);
            }).catch( function(e) {
              modbus_error_check(e);
              console.error(e);
            });
        break;
        case 15:
        case "FC15":
        case "FC 15":
        case "Coils": //FC: 15
          if (Array.isArray(msg.payload)) {
            var values = [];
            for (var i = 0; i < msg.payload.length; i++) {
              values.push(parseInt(msg.payload[i]));
            }
          } else {
            node.error(node.name + ": " + "msg.payload not an array");
            break;
          }
          node.connection
            .writeMultipleCoils(address, values)
            .then(function(resp) {
              set_successful_write(resp);
            }).catch( function(e) {
              modbus_error_check(e);
              console.error(e);
            });
          break;

        case 16:
        case "FC16":
        case "FC 16":
        case "HoldingRegisters": //FC: 16
          if (Array.isArray(msg.payload)) {
            var values = [];
            for (i = 0; i < msg.payload.length; i++) {
              values.push(parseInt(msg.payload[i]));
            }
          } else {
            node.error(node.name + ": " + "msg.payload not an array");
            break;
          }
          node.connection
            .writeMultipleRegisters(address, values)
            .then(function(resp) {
              set_successful_write(resp);
            }).catch( function(e) {
              modbus_error_check(e);
              console.error(e);
            });
          break;

        default:
          break;
      }
    });

    node.on("close", function() {
      timestamplog(node.name + ":" + "Closing");
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
      socket.removeListener("connect", node.onConnectEvent);
      socket.removeListener("close", node.onCloseEvent);
      socket.removeListener('ready', node.onReadyEvent);
    });
  }

  RED.nodes.registerType("modbustcp-write", ModbusTCPWrite);

};
