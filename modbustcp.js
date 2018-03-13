
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

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/T/, " ") // replace T with a space
    .replace(/\..+/, "");
}
function log(msg, args) {
  if (args) console.log(timestamp() + ": " + msg, args);
  else console.log(timestamp() + ": " + msg);
}

module.exports = function(RED) {
  var modbus = require("jsmodbus");
  var util = require("util");
  var ieee = require("./ieee");
  var util = require("util");

  function ModbusTCPServerNode(config) {
    RED.nodes.createNode(this, config);
    this.host = config.host;
    this.port = config.port;
    this.reconnect = config.reconnect;
    this.reconnecttimeout = config.reconnecttimeout;
    this.unit_id = config.unit_id;
    this.modbusconn = null;
    var node = this;
    var consettings = {
      host: node.host,
      port: node.port,
      unitId: Number(node.unit_id),
      timeout: 15000
      /*'logEnabled' : true,
                    'logLevel' : 'debug'*/
    };

    node.initializeModbusTCPConnection = function(handler) {
      log(
        "Connecting to modbustcp slave at " +
          node.host +
          ":" +
          node.port +
          " unit_id: " +
          node.unit_id
      );

      if (Number(node.reconnecttimeout) > 0) {
        consettings.autoReconnect = true;
        consettings.reconnectTimeout = Number(node.reconnecttimeout) * 1000;
      }

      node.modbusconn = modbus.client.tcp.complete(consettings);

      node.modbusconn.on("error", function(err) {
        node.error("ModbusTCPConnection: " + util.inspect(err, false, null));
      });

      node.modbusconn.connect();

      handler(node.modbusconn);
    };

    node.on("close", function() {
      log(
        "Disconnecting from modbustcp slave at " + node.host + ":" + node.port
      );
      node.modbusconn.close();
      node.modbusconn = null;
    });
  }

  RED.nodes.registerType("modbustcp-server", ModbusTCPServerNode);

  function ModbusTCPWrite(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.dataType = config.dataType;
    this.adr = Number(config.adr);
    this.quantity = config.quantity;
    var node = this;
    var modbusTCPServer = RED.nodes.getNode(config.server);

    node.receiveEvent1 = function() {
      log(node.name + " was Disconnected");
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
    };

    node.receiveEvent2 = function() {
      node.status({ fill: "green", shape: "dot", text: "Connected" });
    };

    modbusTCPServer.initializeModbusTCPConnection(function(connection) {
      node.connection = connection;
      node.connection.on("close", node.receiveEvent1);
      node.connection.on("connect", node.receiveEvent2);
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
        node.error(node.name + ": " + "Invalid msg.payload!");
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
      node.connection.removeListener("connect", node.receiveEvent2);
      node.connection.removeListener("close", node.receiveEvent1);
      node.connection.close();
    });
  }

  RED.nodes.registerType("modbustcp-write", ModbusTCPWrite);

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

    var node = this;


    var modbusTCPServer = RED.nodes.getNode(config.server);
    var timerID;

    let timers = {};
    node.receiveEvent1 = function() {
      log(node.name + " was disconnected or was unable to connect");
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
      clearInterval(timerID);
      timerID = null;
    };

    node.receiveEvent2 = function() {
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
      // Ignore standalone mode if rate is 0 and wait for flow input
      if (node.rate != 0){
        ModbusMaster(settings); //fire once at start
        if (!timerID) {
          timerID = setInterval(function() {
            settings.timerID = timerID;
            ModbusMaster(settings);
          }, calcRate());
        }
  
      } 
    };

    modbusTCPServer.initializeModbusTCPConnection(function(connection) {
      node.connection = connection;
      node.status({ fill: "blue", shape: "dot", text: "Initiating....." });
      node.connection.on("close", node.receiveEvent1);
      node.connection.on("connect", node.receiveEvent2);
    });

    node.on("input", msg => {

      if (msg.hasOwnProperty('kill') && msg.kill === true){
        if (msg.hasOwnProperty('payload') && msg.payload.hasOwnProperty('name') && msg.payload.name ){
          clearInterval(timers[msg.payload.name]);
          return;
        }
      }
      const SetupLoop = (params) => {
        console.log('Starting Loop', params.name);
        let settings = {
          name: params.name || node.name || "",
          topic: params.topic || msg.topic || node.topic || node.name,
          adr: params.address || node.adr,
          quantity: params.quantity || node.quantity,
          dataType: params.dataType || node.dataType,
          ieeeType: params.ieeeType || node.ieeeType,
          ieeeBE: node.ieeeBE
        };

        if (params.hasOwnProperty('ieeeBE') && util.isBoolean(params.ieeeBE)){
          settings.ieeeBE = params.ieeeBE;
        }
  
        if (settings.name && timers.hasOwnProperty(settings.name)){
          clearInterval(timers[settings.name]);
        }
  
        ModbusMaster(settings); // jumpstart
  
        let loopId = setInterval(function() {
          settings.timerID = loopId;
          ModbusMaster(settings);
        }, params.interval || calcRate());
  
        if (settings.name){
          timers[settings.name] = loopId;
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

    function calcRate() {
      let rate;
      switch (node.rateUnit) {
        case "s":
          rate = node.rate * 1000; //seconds
          break;
        case "m":
          rate = node.rate * 60000; //minutes
          break;
        case "h":
          rate = node.rate * 3600000; //hours
          break;
        case "ms":
        default:
          rate = node.rate; //milliseconds
          break;
      }
      return rate;
    }

    function numfloat(nums, isBE) 
    {
      // console.log('Got a numfloat', nums);
      var x = 0;
        var data = [];
        for (var i=0; i<nums.length; i=i+2) {
          var num = [];
          //currently setup for Big Endian (swap i and i+1 for Little Endian)
          var z = (isBE) ? i : i + 1;
          num[0] =   nums[z] >> 8;
          num[1] = (nums[z] & 0x00FF);
          z = (isBE) ? i + 1 : i;
          num[2] = nums[z] >> 8;
          num[3] = (nums[z] & 0x00FF);
          data[x] = ieee.unpackF32(num.reverse());
          // console.log(data[x]);
          x++;
        }
        return data;

    }

    function numdouble(nums, isBE) 
    {
        //console.log('Got a numdouble:', isBE);
        var x = 0;
        var data = [];

        var offset = [];
        var z;

        if (isBE != true){
          for (z = 3; z >= 0; z=z-1){
            offset.push(z);
          }
        }
        else{
          for (z = 0; z <= 3; z=z+1){
            offset.push(z);
          }          
        }

        for (var i=0; i<nums.length; i=i+4) {
          var num = [];
          //currently setup for Big Endian (swap i and i+1 for Little Endian)
          num[0] =   nums[i + offset[0]] >> 8;
          num[1] = (nums[i + offset[0]] & 0x00FF);
          num[2] = nums[i+ offset[1]] >> 8;
          num[3] = (nums[i+ offset[1]] & 0x00FF);
          num[4] =   nums[i+ offset[2]] >> 8;
          num[5] = (nums[i+ offset[2]] & 0x00FF);
          num[6] = nums[i+ offset[3]] >> 8;
          num[7] = (nums[i+ offset[3]] & 0x00FF);
          data[x] = ieee.unpackF64(num.reverse());
          x++;
        }
        return data;
    }


    function ModbusMaster(settings) {
      var msg = {};
      msg.settings = settings;
      msg.topic = settings.topic;

      switch (settings.dataType) {
        // accept either a #, a name (Coil), or an FC string (FC1, FC 1)
        // (Maybe should do case insensitive compare?)
        //
        case 1:
        case "FC1":
        case "FC 1":
        case "Coil": //FC: 1
          set_connected_polling();
          node.connection
            .readCoils(Number(settings.adr), Number(settings.quantity))
            .then(function(resp, error) {
              if (modbus_error_check(error) && resp) {
                set_connected_waiting();
                msg.payload = resp.coils; // array of coil values
                node.send(msg);
              }
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

    node.on("close", function() {
      log(node.name + ":" + "Closing");
      clearInterval(timerID);
      timerID = null;
      node.connection.removeListener("connect", node.receiveEvent2);
      node.connection.removeListener("close", node.receiveEvent1);
      node.status({ fill: "grey", shape: "dot", text: "Disconnected" });
      node.connection.close();
    });
  }

  RED.nodes.registerType("modbustcp-read", ModbusTCPRead);
};
