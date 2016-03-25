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
    return new Date().toISOString().replace(/T/, ' ').// replace T with a space
    replace(/\..+/, '')
}
function log(msg, args) {
    if (args)
        console.log(timestamp() + ': ' + msg, args);
    else
        console.log(timestamp() + ': ' + msg);
}


module.exports = function (RED) {

    var modbus = require('jsmodbus');
    var util = require('util');

    // ########################################## SERVER #############################################################

    function ModbusTCPServerNode(config) {

        RED.nodes.createNode(this, config);

        this.host = config.host;
        this.port = config.port;
        this.unit_id = config.unit_id;
        this.modbusconn = null;

        var node = this;

        node.initializeModbusTCPConnection = function (handler) {

            if (node.modbusconn && node.modbusconn.isConnected()) {
                if (handler && (typeof handler === 'function')) {
                    // attention hanlders can become memory leaking by requesting them ever and ever
                    // handlers are resources they have to be closed before you use a new handler
                    handler(node.modbusconn);
                }
                return node.modbusconn;
            }

            log('Connecting to modbustcp slave at ' + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);

            node.modbusconn = null;
            node.modbusconn = modbus.createTCPClient(config.port, config.host, Number(config.unit_id),
                function (err) {
                    if (err) {
                        node.error('ModbusTCPConnection: ' + util.inspect(err, false, null));
                        return null;
                    }
                    console.log('ModbusTCP Server connected ' + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);
                    node.warn("MODBUS TCP Server connected " + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);
                });

            if (handler && (typeof handler === 'function')) {
                handler(node.modbusconn);
            }

            return node.modbusconn;

        };

        node.on("close", function () {
            node.warn("MODBUS TCP Server close " + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);

            console.log('disconnecting from modbustcp slave at ' + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);

            if (node.modbusconn && node.modbusconn.isConnected()) {
                node.modbusconn.close();
                node.modbusconn = null;
                console.log("MODBUS TCP Server closed");
                node.warn("MODBUS TCP Server closed");
            }
        });
    }

    RED.nodes.registerType("modbustcp-server", ModbusTCPServerNode);

    // ########################################## WRITE #############################################################

    function ModbusTCPWrite(config) {

        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = Number(config.adr);
        this.quantity = config.quantity;

        var node = this;
        var modbusTCPServer = RED.nodes.getNode(config.server);

        modbusTCPServer.initializeModbusTCPConnection(function (connection) {

            node.connection = connection;

            node.receiveEvent1 = function () {
                if (!node.connection.isConnected()) {
                    console.log('Modbus TCP for writing is not connected');
                    set_unconnected_waiting();
                }
            };

            node.connection.on('close', node.receiveEvent1);

        });

        function set_connected_written(resp) {
            node.status({fill: "green", shape: "dot", text: util.inspect(resp, false, null)});
        }

        function set_unconnected_waiting() {
            node.status({fill: "blue", shape: "dot", text: "not connected waiting"});
        }

        function set_modbus_error(err) {
            if (err) {
                node.status({fill: "red", shape: "dot", text: "Error"});
                console.log(err);
                node.error('ModbusTCPClient: ' + JSON.stringify(err));
                return false;
            }
            return true;
        }

        this.on("input", function (msg) {

                if (!(msg && msg.hasOwnProperty('payload'))) return;

                if (msg.payload == null) {
                    node.error('ModbusTCPWrite: Invalid msg.payload!');
                    return;
                }

                node.status(null);

                if (!node.connection.isConnected()) {
                    set_unconnected_waiting();
                    return;
                }

                switch (node.dataType) {
                    case "Coil": //FC: 5

                        if (msg.payload.length < node.quantity) {
                            node.error("Quantity should be less or equal to coil payload array Addr: ".join(node.adr, " Q: ", node.quantity));
                        }
                        if (node.quantity > 1) {
                            for (i = node.adr; i < node.quantity; i++) {

                                node.connection.writeSingleCoil(i, msg.payload[i], function (resp, err) {
                                    if (set_modbus_error(err) && resp) {
                                        set_connected_written(resp);
                                    }
                                });
                            }
                        } else {
                            node.connection.writeSingleCoil(node.adr, msg.payload, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_connected_written(resp);
                                }
                            });
                        }
                        break;

                    case "HoldingRegister": //FC: 6

                        if (msg.payload.length < node.quantity) {
                            node.error("Quantity should be less or equal to register payload array Addr: ".join(node.adr, " Q: ", node.quantity));
                        }
                        if (node.quantity > 1) {
                            for (i = node.adr; i < node.quantity; i++) {
                                node.connection.writeSingleRegister(i, Number(msg.payload[i]), function (resp, err) {
                                    if (set_modbus_error(err) && resp) {
                                        set_connected_written(resp);
                                    }
                                });
                            }
                        } else {
                            node.connection.writeSingleRegister(node.adr, Number(msg.payload), function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_connected_written(resp);
                                }
                            });
                        }

                        break;

                    default:
                        break;
                }
            }
        );

        node.on("close", function () {
            node.warn("MODBUS TCP write close");
            node.status({fill: "grey", shape: "dot", text: "Disconnected"});
        });
    }

    RED.nodes.registerType("modbustcp-write", ModbusTCPWrite);


    // ########################################## READ #############################################################

    function ModbusTCPRead(config) {

        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = config.adr;
        this.quantity = config.quantity;
        this.rate = config.rate;
        this.rateUnit = config.rateUnit;
        this.connection = null;

        var node = this;
        var modbusTCPServer = RED.nodes.getNode(config.server);
        var timerID;

        modbusTCPServer.initializeModbusTCPConnection(function (connection) {

            node.receiveEvent1 = function () {
                if (!node.connection.isConnected()) {
                    console.log('Modbus TCP for reading is not connected');
                    set_unconnected_waiting();
                }
            };

            function set_connected_waiting() {
                node.status({fill: "green", shape: "dot", text: "polling rate:" + node.rate + node.rateUnit});
            }

            function set_unconnected_waiting() {
                node.status({fill: "blue", shape: "dot", text: "polling rate:" + node.rate + node.rateUnit});
            }

            function set_connected_polling() {
                node.status({fill: "yellow", shape: "dot", text: "polling from Modbus"});
            }

            function set_modbus_error(err) {
                if (err) {
                    node.status({fill: "red", shape: "dot", text: "Error"});
                    console.log(err);
                    node.error('ModbusTCPClient: ' + JSON.stringify(err));
                    return false;
                }
                return true;
            }

            node.receiveEvent2 = function () {
                set_connected_waiting();
                ModbusMaster(); // fire once at start and then by it's fired by the timer event - setInterval
                timerID = setInterval(function () {
                    ModbusMaster();
                }, calc_rateByUnit());
            };


            function calc_rateByUnit() {

                var rate = 1000;

                switch (node.rateUnit) {
                    case "ms":
                        rate = node.rate; // milli seconds
                        break;
                    case "s":
                        rate = node.rate * 1000; // seconds
                        break;
                    case "m":
                        rate = node.rate * 60000; // minutes
                        break;
                    case "h":
                        rate = node.rate * 3600000; // hours
                        break;
                    default:
                        break;
                }

                return rate;
            }

            node.connection = connection;
            node.connection.on('close', node.receiveEvent1);
            node.connection.on('connect', node.receiveEvent2);

            function ModbusMaster() {

                var msg = {};
                msg.topic = node.name;

                if (node.connection.isConnected()) {

                    switch (node.dataType) {
                        case "Coil": //FC: 1
                            set_connected_polling();
                            node.connection.readCoils(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.coils; // array of coil values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "Input": //FC: 2
                            set_connected_polling();
                            node.connection.readDiscreteInput(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.coils; // array of discrete input values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "HoldingRegister": //FC: 3
                            node.status({fill: "yellow", shape: "dot", text: "Polling"});
                            node.connection.readHoldingRegister(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.register; // array of register values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "InputRegister": //FC: 4                        
                            node.status({fill: "yellow", shape: "dot", text: "Polling"});
                            node.connection.readInputRegister(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.register; // array of register values
                                    node.send(msg);
                                }
                            });
                            break;
                    }
                }
                else {
                    console.log('No Modbus TCP Server Connection Detected, Initiating....');
                    clearInterval(timerID);

                    node.connection = modbusTCPServer.initializeModbusTCPConnection();
                    node.connection.on('close', node.receiveEvent1);
                    node.connection.on('connect', node.receiveEvent2);
                    set_unconnected_waiting();
                }
            }

        });

        node.on("close", function () {
            node.warn("MODBUS TCP read close");
            clearInterval(timerID);
            node.status({fill: "grey", shape: "dot", text: "Disconnected"});
        });
    }

    RED.nodes.registerType("modbustcp-read", ModbusTCPRead);

};
