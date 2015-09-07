/**
 * Copyright 2015 Valmet Automation Inc.
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
 **/

/**
 NodeRed node with support for MODBUS TCP based on jsmodbus.
**/
function timestamp() {
    return new Date().
        toISOString().
        replace(/T/, ' ').      // replace T with a space
        replace(/\..+/, '')
}
function log(msg, args) {
    if (args)
        console.log(timestamp() + ': ' + msg, args);
    else
        console.log(timestamp() + ': ' + msg);
}


module.exports = function (RED) {
    var RED = require(process.env.NODE_RED_HOME+"/red/red");

    log("loading modbustcpmaster.js for node-red");
    var modbus = require('jsmodbus');

        /**
     * ====== ModbusTCP-CONTROLLER ===========
     * Holds configuration for modbustcpmaster host+port,
     * initializes new modbustcpmaster connections
     * =======================================
     */
    function ModbusTCPControllerNode(config) {
        //log("new ModbusTCPControllerNode, config: %j", config);
        RED.nodes.createNode(this, config);
        this.host = config.host;
        this.port = config.port;
        this.coils = config.coils || [];
        this.modbusconn = null;
        var node = this;

         /**
         * Initialize an modbustcp socket, calling the handler function
         * when successfully connected, passing it the modbustcp connection
         */
        this.initializeModbusTCPConnection = function (handler) {
            if (node.modbusconn) {
                log('already connected to modbustcp slave at ' + config.host + ':' + config.port);
                if (handler && (typeof handler === 'function')){
                    handler(node.modbusconn);
                }
                return node.modbusconn;
            }
            log('connecting to modbustcp slave at ' + config.host + ':' + config.port);
            node.modbusconn = null;
            node.modbusconn = modbus.create(config.port, config.host, function(err){
                if (err) {
                    log('connecting to modbustcp slave at ' + config.host + ':' + config.port);
                    return null;
                } 
                log('ModbusTCP: successfully connected to ' + config.host + ':' + config.port);
            });
            node.modbusconn.connect();

            if (handler && (typeof handler === 'function'))
                handler(node.modbusconn);
            return node.modbusconn;
        };

        /* ===== Node-Red events ===== */
        this.on("close", function () {
            log('disconnecting from modbustcp slave at %s:%d', [config.host, config.port]);
            node.modbusconn && node.modbusconn.disconnect && node.modbusconn.disconnect();
        });
    }

    RED.nodes.registerType("modbustcp-controller", ModbusTCPControllerNode);
    /**
     * ====== ModbusTCP-OUT ==================
     * Sends outgoing ModbusTCP telegrams from
     * messages received via node-red flows
     * =======================================
     */
    function ModbusTCPOut(config) {
        //log('new ModbusTCP-OUT, config: %j', config);
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = config.adr;
        this.ctrl = RED.nodes.getNode(config.controller);
        var node = this;
        /* ===== Node-Red events ===== */
        this.on("input", function (msg) {
            log('modbustcp-out.onInput, msg=%j', msg);
            if (!(msg && msg.hasOwnProperty('payload'))) return;
            
            if (msg.payload == null) {
                log('modbustcp-out.onInput: illegal msg.payload!');
                return;
            }

            switch (node.dataType) {
                case "Coil":
                    this.ctrl.initializeModbusTCPConnection(function(connection){
                        connection.writeSingleCoil(+node.adr, +msg.payload);
                    })
                    break;
                case "HoldingRegister":
                    this.ctrl.initializeModbusTCPConnection(function(connection){
                        connection.writeSingleRegister(+node.adr, +msg.payload);
                    })
                    break;
            }
        });

        this.on("close", function () {
            log('modbustcp-out.close');
        });
    }

    //
    RED.nodes.registerType("modbustcp-out", ModbusTCPOut);

    function ModbusTCPIn(config) {
        //log('new ModbusTCP-IN, config: %j', config);
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = config.adr;
        this.connection = null;
        var node = this;
        var modbusTCPController = RED.nodes.getNode(config.controller);

        /* ===== modbustcp events ===== */
        // initialize incoming modbustcp event socket
        // there's only one connection for modbustcp-in:
        modbusTCPController.initializeModbusTCPConnection(function(connection){

            node.receiveEvent = function(val){
                log('modbustcp event: Data.' + node.dataType + '.' + node.adr + '=' + val);
                node.send({
                    topic: 'modbustcp:event',
                    payload: val
                });
            }

            node.connection = connection;
            node.connection.on('Data.' + node.dataType + '.' + node.adr, node.receiveEvent);

            switch (node.dataType){
                case "Coil":
                    node.connection.addPollingCoils(+node.adr);
                    break;
                case "Input":
                    node.connection.addPollingInputs(+node.adr);
                    break;
                case "HoldingRegister":
                    node.connection.addPollingHoldingRegisters(+node.adr);
                    break;
                case "InputRegister":
                    node.connection.addPollingInputRegisters(+node.adr);
                    break;
            }
        });

        /* ===== Node-Red events ===== */
        this.on("close", function () {
            if (node.connection && node.receiveEvent)
                node.connection.off('Data.' + node.dataType + '.' + node.adr, node.receiveEvent);
        });

    }

    //
    RED.nodes.registerType("modbustcp-in", ModbusTCPIn);

}
