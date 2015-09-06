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

    log("loading modbustcpmaster.js for node-red");
    var modbus = require('./src/modbustcpmaster');

    /**
     * ====== ModbusTCP-CONTROLLER ===========
     * Holds configuration for modbustcpmaster host+port,
     * initializes new modbustcpmaster connections
     * =======================================
     */
    function ModbusTCPControllerNode(config) {
        log("new ModbusTCPControllerNode, config: %j", config);
        RED.nodes.createNode(this, config);
        this.host = config.host;
        this.port = config.port;
        this.modbusconn = null;
        var node = this;

        this.on("close", function () {
            log('disconnecting from modbustcp slave at %s:%d', [config.host, config.port]);
            node.modbusconn && node.modbusconn.Disconnect && node.modbusconn.Disconnect();
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
        log('new ModbusTCP-OUT, config: %j', config);
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.type = config.type;
        this.adr = config.adr;
        this.ctrl = RED.nodes.getNode(config.controller);
        var node = this;
        //
        this.on("input", function (msg) {

        });
        this.on("close", function () {
            log('ModbusTCPOut.close');
        });
    }

    //
    RED.nodes.registerType("modbustcp-out", ModbusTCPOut);

    /**
     * ====== ModbusTCP-IN ===================
     * Handles incoming ModbusTCP events, injecting
     * json into node-red flows
     * =======================================
     */
    function ModbusTCPIn(config) {
        log('new ModbusTCP-IN, config: %j', config);
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.type = config.type;
        this.adr = config.adr;
        this.connection = null;
        var node = this;
        var ctrl = RED.nodes.getNode(config.controller);
        /* ===== Node-Red events ===== */
        this.on("input", function (msg) {
            if (msg != null) {

            }
        });
        var that = this;
        this.on("close", function () {
        });

        /* ===== modbustcp events ===== */
        // initialize incoming modbusTCP event socket (openGroupSocket)
        // there's only one connection for modbustcp-in:
    }

    //
    RED.nodes.registerType("modbustcp-in", ModbusTCPIn);
}
