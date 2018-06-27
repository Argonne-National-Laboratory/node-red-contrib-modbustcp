
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

import { calcRate, numdouble, numfloat } from './helpers';
import { timestamp, log} from './helpers';

// let helper = require('./helpers');
// let calcRate = helper.calcRate;
// let numdouble = helper.numdouble;
// let numfloat = helper.numfloat;
// let timestamp = helper.timestamp;
// let log = helper.log;



module.exports = function(RED) {
  let Modbus = require("jsmodbus");
  let net = require('net');
  let socket = new net.Socket();
  let util = require("util");

  function ModbusTCPServerNode(config) {
    RED.nodes.createNode(this, config);
    this.host = config.host;
    this.port = config.port;
    this.reconnect = config.reconnect;
    this.reconnecttimeout = config.reconnecttimeout;
    this.unit_id = config.unit_id;
    this.modbusconn = null;
    this.socket = socket;

    var node = this;
    var consettings = {
      host: node.host,
      port: node.port,
      //unitId: Number(node.unit_id),
      //timeout: 15000
      // logEnabled : true,
      // logLevel : 'debug'
    };

    node.initializeModbusTCPConnection = function(onConnect,handler) {
      log( `Connecting to modbustcp slave at ${node.host}:${node.port} unit_id: ${node.unit_id}`);

      if (Number(node.reconnecttimeout) > 0) {
        consettings.autoReconnect = true;
        consettings.reconnectTimeout = Number(node.reconnecttimeout) * 1000;
      }
      node.modbusconn = new Modbus.client.TCP(socket,Number(node.unit_id));
      
      // node.modbusconn.TCP.on("error", function(err) {
      //   node.error("ModbusTCPConnection: " + util.inspect(err, false, null));
      //   //node.modbusconn.emit('newState_ready');
      // });

      socket.on('contect', () => console.log('socket connected'));
      socket.on('close', () => console.log('socket closed'));
      socket.on('ready', () => console.log('socket ready'));
      socket.on('timeout', () => console.log('socket timeout'));

      socket.connect(consettings,onConnect);

      handler(node.modbusconn);

    };

    node.on("close", function() {
      log(`Disconnecting from modbustcp slave at ${node.host}:${node.port}`);
      socket.end();
      node.modbusconn = null;
    });
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
    
    var connectionStatus = _DISCONNECTED;

    var node = this;

    var modbusTCPServer = RED.nodes.getNode(config.server);

    // Timers
    let timerID; // used for single node (non-inject) modbus event
    let timers = {}; // used as a collection of running timers externally injected

    node.onCloseEvent = function() {
      log(node.name + " was disconnected or was unable to connect");
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
      connectionStatus = _DISCONNECTED;
      clearInterval(timerID);
      timerID = null;
    };

    node.onConnectEvent = function() {

      console.log('hello 1');

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
      clearInterval(timerID);
      timerID = null;
      connectionStatus = _CONNECTED;

      // Ignore standalone mode if rate is 0 and wait for flow input
      if (node.rate != 0){
        console.log('hello there')

        ModbusMaster(settings); //fire once at start
        if (!timerID) {
          timerID = setInterval(function() {
            settings.timerID = timerID;
            ModbusMaster(settings);
          }, calcRate(node.rate, node.rateUnit));
        }
  
      } 
    };

    socket.on("connect", node.onConnectEvent);
    socket.on("close", node.onCloseEvent);

    modbusTCPServer.initializeModbusTCPConnection(node.onConnectEvent,function(connection) {
      node.connection = connection;
      node.status({ fill: "blue", shape: "dot", text: "Initiating....." });
      // socket.on("connect", node.onConnectEvent);
      // socket.on("close", node.onCloseEvent);
    });

    node.on("close", function() {
      log(node.name + ":" + "Closing");

      connectionStatus = _DISCONNECTED;

      clearInterval(timerID);
      timerID = null;

      for (var property in timers){
        if (timers.hasOwnProperty(property)){
          clearInterval(timers[property]);
        }
      }
      socket.removeListener("connect", node.onConnectEvent);
      socket.removeListener("close", node.onCloseEvent);
      socket.end();
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

        function processValues(values, name, interval){

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

            // console.log
            if (value.hasOwnProperty('ieeeBE') && util.isBoolean(value.ieeeBE)){
              settings.ieeeBE = value.ieeeBE;
            }


            // only attempt to read if the connection is ready
            //if (node.connection.getState() === 'ready')
            console.log('State: ',node.connection.getState());
              ModbusMaster(settings); 
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
    
    function ModbusMaster(settings) {
      var msg = {};
      msg.settings = settings;
      msg.topic = settings.topic;

      // Do nothing if we are not connected
      //if (connectionStatus === _DISCONNECTED) return;

      console.log('Yippy, ModbusMaser')

      switch (settings.dataType) {
        // accept either a #, a name (Coil), or an FC string (FC1, FC 1)
        // (Maybe should do case insensitive compare?)
        //
        case 1:
        case "FC1":
        case "FC 1":
        case "Coil": //FC: 1
          console.log('In a Coil read');
          set_connected_polling();
          node.connection.readCoils(Number(settings.adr), Number(settings.quantity))
            .then( function(resp) {
//              if (modbus_error_check(error) && resp) {
                set_connected_waiting();
                // msg.payload = resp.coils; // array of coil values
                msg.payload = resp.response.body.valuesAsArray;
                node.send(msg);
//              }
            }).catch(function() {
              console.error(arguments);
            });
          break;
        case 2:
        case "FC2":
        case "FC 2":
        case "Input": //FC: 2
          set_connected_polling();
          node.connection
            .readDiscreteInputs(Number(settings.adr), Number(settings.quantity))
            .then(function(resp, error) {
              if (modbus_error_check(error) && resp) {
                set_connected_waiting();
                msg.payload = resp.coils; // array of discrete input values
                node.send(msg);
              }
            });
          break;
        case 3:
        case "FC3":
        case "FC 3":            
        case "HoldingRegister": //FC: 3
          set_connected_polling();
          node.connection
            .readHoldingRegisters(
              Number(settings.adr),
              Number(settings.quantity)
            )
            .then(function(resp, error) {
              if (modbus_error_check(error) && resp) {
                set_connected_waiting();
                // console.log('settings:', settings.ieeeType);
                // console.log('Big End: ', settings.ieeeBE);
                switch(settings.ieeeType){
                  case 'single':
                    msg.payload = numfloat(resp.register, settings.ieeeBE);
                    break;
                  case 'double':
                    msg.payload = numdouble(resp.register, settings.ieeeBE);
                    break;
                  case 'off':
                  default:
                    msg.payload = resp.register; // array of register values
                    break;
                }
                node.send(msg);
              }
            });
          break;

        case 4:
        case "FC4":
        case "FC 4":
        case "InputRegister": //FC: 4
          set_connected_polling();
          node.connection
            .readInputRegisters(Number(settings.adr), Number(settings.quantity))
            .then(function(resp, error) {
              if (modbus_error_check(error) && resp) {
                set_connected_waiting();
                switch(settings.ieeeType){
                  case 'single':
                    msg.payload = numfloat(resp.register, settings.ieeeBE);
                    break;
                  case 'double':
                    msg.payload = numdouble(resp.register, settings.ieeeBE);
                    break;
                  case 'off':
                  default:
                    msg.payload = resp.register; // array of register values
                    break;
                }
                node.send(msg);
              }
            });
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

    function set_connected_polling() {
      node.status({ fill: "yellow", shape: "dot", text: "Polling" });
    }

    function modbus_error_check(err) {
      if (err) {
        node.status({ fill: "red", shape: "dot", text: "Error" });
        log(err);
        node.error("ModbusTCPClient: " + JSON.stringify(err));
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

    node.onCloseEvent = function() {
      log(`${node.name} was Disconnected`);
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
    };

    node.onConnectEvent = function() {
      node.status({ fill: "green", shape: "dot", text: "Connected" });
    };

    socket.on("connect", node.onConnectEvent);
    socket.on("close", node.onCloseEvent);
    
    modbusTCPServer.initializeModbusTCPConnection(node.onConnectEvent,function(connection) {
      node.connection = connection;
      // node.socket.on("close", node.onCloseEvent);
      // node.socket.on("connect", node.onConnectEvent);
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
        log(err);
        node.error(node.name + ": " + JSON.stringify(err));
        return false;
      }
      return true;
    }

    node.on("input", msg => {
      let address;
      let dataType;

      if (node.connection.getState() === "closed") {
        if (!node.connection.autoReconnect) {
          node.connection.connect();
        }
      }

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
        dataType = msg.datatype;
      } else {
        dataType = node.dataType;
      }

      node.status({});

      switch (dataType) {
        case 5:
        case "FC5":
        case "FC 5":
        case "Coil": //FC: 5
          node.connection
            .writeSingleCoil(address, Number(msg.payload))
            .then(function(resp, err) {
              if (modbus_error_check(err) && resp) {
                set_successful_write(resp);
              }
            });

          break;
        case 6:
        case "FC6":
        case "FC 6":
        case "HoldingRegister": //FC: 6
          node.connection
            .writeSingleRegister(address, Number(msg.payload))
            .then(function(resp, err) {
              if (modbus_error_check(err) && resp) {
                set_successful_write(resp);
              }
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
            .then(function(resp, err) {
              if (modbus_error_check(err) && resp) {
                set_successful_write(resp);
              }
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
            .then(function(resp, err) {
              if (modbus_error_check(err) && resp) {
                set_successful_write(resp);
              }
            });

          break;

        default:
          break;
      }
    });

    node.on("close", function() {
      log(node.name + ":" + "Closing");
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
      socket.removeListener("connect", node.onConnectEvent);
      socket.removeListener("close", node.onCloseEvent);
      socket.end();
      //socket.close();
    });
  }

  RED.nodes.registerType("modbustcp-write", ModbusTCPWrite);


};
