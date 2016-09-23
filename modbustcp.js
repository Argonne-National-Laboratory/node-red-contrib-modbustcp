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
    return new Date().toISOString().replace(/T/, ' ').     // replace T with a space
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
    var EC = '';

    function ModbusTCPServerNode(config) {
        RED.nodes.createNode(this, config);
        this.host = config.host;
        this.port = config.port;
        this.unit_id = config.unit_id;                
        this.modbusconn = null;        
        var node = this;

        node.initializeModbusTCPConnection = function (handler) {

            if (node.modbusconn && node.modbusconn.isConnected()) {
                //Node was probably re-deployed, close current connection then reconnect
                console.log('Disconnecting modbustcp slave at ' + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);
                node.modbusconn.close();                
            }

            console.log('Connecting to modbustcp slave at ' + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);
            node.modbusconn = null;
            node.modbusconn = modbus.createTCPClient(config.port, config.host, Number(config.unit_id), 
            function(err) {
                if (err) {                                      
                    node.error('ModbusTCPConnection: ' + util.inspect(err, false, null));              
                    EC = err.code;
                    return null;
                } 
                console.log('Successfully connected to ' + config.host + ':' + config.port + ' unit_id: ' + config.unit_id);                
            });

            handler(node.modbusconn);           
        };
        
        node.on("close", function () {
            console.log('Disconnecting from modbustcp slave at ' + config.host + ':' + config.port);            
            
            if (node.modbusconn && node.modbusconn.isConnected()) {
                node.modbusconn.close();
                node.modbusconn = null;
                console.log("ModbusTCP Connection Closed");                
            }
            else {
                node.modbusconn = null;
                console.log("ModbusTCP Connection Closed");             
            }
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
        
            modbusTCPServer.initializeModbusTCPConnection(function (connection) {
                
                node.connection = connection;               

                node.receiveEvent1 = function () {
                    if(!node.connection.isConnected())
                    {                        
                        console.log(node.name + ' was Disconnected'); 
                        node.status({fill:"grey",shape:"dot",text:"Disconnected"});  
                    }              
                }; 

                node.receiveEvent2 = function(){                                
                node.status({fill:"green",shape:"dot",text:"Connected"});         
                };

                node.connection.on('close', node.receiveEvent1);
                node.connection.on('connect', node.receiveEvent2);
            });

            function set_successful_write(resp) {
                node.status({fill: "green", shape: "dot", text: util.inspect(resp, false, null)});
            }

            function modbus_error_check(err) {
                if (err) {
                    node.status({fill:"red",shape:"dot",text:"Error"});
                    console.log(err);                                 
                    node.error('ModbusTCPClient: ' + JSON.stringify(err));
                    return false;
                }
                return true;
            }

            this.on("input", function (msg) {            
            if (!(msg && msg.hasOwnProperty('payload'))) return;
            
            if (msg.payload == null) {
                node.error('ModbusTCPClient: Invalid msg.payload!');
                return;
            }

            node.status(null);
            

                switch (node.dataType) {
                    case "Coil": //FC: 5  

                        if (msg.payload.length < node.quantity) {
                            node.error("Quantity should be less or equal to coil payload array Addr: ".join(node.adr, " Q: ", node.quantity));
                        }

                        if (node.quantity > 1) {
                            for (i = node.adr; i < node.quantity; i++) {
                                node.connection.writeSingleCoil(i, msg.payload[i], function (resp, err) {
                                    if(modbus_error_check(err) && resp) {
                                        set_successful_write(resp);
                                    }
                                });
                            }
                        }
                        else {
                            node.connection.writeSingleCoil(node.adr, Number(msg.payload), function (resp, err) {
                                if(modbus_error_check(err) && resp) {
                                        set_successful_write(resp);
                                }   
                            });
                        }     
                        break;

                    case "HoldingRegister": //FC: 6                               
                        if (msg.payload.length < node.quantity) {
                            node.error("Quantity should be less or equal to coil payload array Addr: ".join(node.adr, " Q: ", node.quantity));
                        }
                        if (node.quantity > 1) {
                            for (i = node.adr; i < node.quantity; i++) {
                                node.connection.writeSingleRegister(i, msg.payload[i], function (resp, err) {
                                    if(modbus_error_check(err) && resp) {
                                        set_successful_write(resp);
                                    }
                                });
                            }
                        }
                        else {
                            node.connection.writeSingleRegister(node.adr, Number(msg.payload), function (resp, err) {
                                if(modbus_error_check(err) && resp) {
                                        set_successful_write(resp);
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
            node.receiveEvent1 = null;
            node.status({fill:"grey",shape:"dot",text:"Disconnected"});
        });


    }

    
    RED.nodes.registerType("modbustcp-write", ModbusTCPWrite);

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
        var unreachable_timerID;      

        modbusTCPServer.initializeModbusTCPConnection(function (connection) { 

            node.connection = connection;
            node.status({fill:"blue",shape:"dot",text:"Initiating....."});            
                        

            node.receiveEvent1 = function () {
                if(!node.connection.isConnected())
                {
                    console.log(node.name + ' was disconnected or was unable to connect');
                    node.status({fill:"grey",shape:"dot",text:"Disconnected"});                    
                    //Retry
                    clearInterval(timerID); 
                    timerID = null;                    
                    node.status({fill:"blue",shape:"dot",text:"Retrying....."});                   
                    if (EC != 'EHOSTUNREACH') {                         
                        reconnect();
                    }
                    else if (EC == 'EHOSTUNREACH')
                    {                        
                        if(!unreachable_timerID) {
                            unreachable_timerID = setInterval(function () { 
                              reconnect();
                            }, 300000); //retry every 5 min 300000
                        }
                    }
                }              
            };
            
            node.receiveEvent2 = function(){                                
                node.status({fill:"green",shape:"dot",text:"Connected: Rate:" + node.rate + " " + node.rateUnit});              
                clearInterval(unreachable_timerID); 
                unreachable_timerID = null;         
                
                ModbusMaster(); //fire once at start                
                if (!timerID) {                    
                    timerID = setInterval(function () {                 
                      ModbusMaster();
                    }, calcRate());  
                }           
            };

            function reconnect() {
                modbusTCPServer.initializeModbusTCPConnection(function (connection) {
                    console.log('reconnect function fired!');                    
                    if (connection != null) {
                        node.connection = connection;                   
                        if ((typeof node.connection.on === "function") && (typeof node.receiveEvent1 === "function")  && (typeof node.receiveEvent1 === "function")) {                            
                            node.connection.on('close', node.receiveEvent1);
                            node.connection.on('connect', node.receiveEvent2); 
                        }
                    }
                });
            }
            
            node.connection.on('close', node.receiveEvent1);
            node.connection.on('connect', node.receiveEvent2);  
        });  

            function set_connected_waiting() {
                node.status({fill:"green",shape:"dot",text:"Connected: Rate:" + node.rate + " " + node.rateUnit});
            }

            function set_connected_polling() {
                node.status({fill:"yellow",shape:"dot",text:"Polling"});
            }

            function modbus_error_check(err) {
                if (err) {
                    node.status({fill:"red",shape:"dot",text:"Error"});
                    console.log(err);                                 
                    node.error('ModbusTCPClient: ' + JSON.stringify(err));
                    return false;
                }
                return true;
            }       

            function calcRate() {
                switch (node.rateUnit) {
                    case "ms":
                        rate = node.rate; //milliseconds
                        break;
                    case "s":
                        rate = node.rate * 1000; //seconds
                        break;
                    case "m":
                        rate = node.rate * 60000; //minutes
                        break;
                    case "h":
                        rate = node.rate * 3600000; //hours
                        break;
                    default:
                        break;
                }
                return rate;
            }

            function ModbusMaster() {
                var msg = {};  
                msg.topic = node.name;  

                if(node.connection.isConnected()) {     
                    
                    switch (node.dataType){
                        case "Coil": //FC: 1
                            set_connected_polling();
                            node.connection.readCoils(node.adr, node.quantity, function (resp, err) { 
                                if (modbus_error_check(err) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.coils; // array of coil values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "Input": //FC: 2
                            set_connected_polling();
                            node.connection.readDiscreteInput(node.adr, node.quantity, function (resp, err) { 
                                if (modbus_error_check(err) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.coils; // array of discrete input values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "HoldingRegister": //FC: 3
                            set_connected_polling();
                            node.connection.readHoldingRegister(node.adr, node.quantity, function (resp, err) { 
                                if (modbus_error_check(err) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.register; // array of register values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "InputRegister": //FC: 4                        
                            set_connected_polling();                            
                            node.connection.readInputRegister(node.adr, node.quantity, function (resp, err) { 
                                if (modbus_error_check(err) && resp) {                                 
                                    set_connected_waiting();
                                    msg.payload = resp.register; // array of register values
                                    node.send(msg);                                    
                                }                                                               
                            });
                            break;
                    }
                } 
                else
                {
                    console.log('No Modbus TCP Server Connection Detected, Initiating....');
                    clearInterval(timerID);
                    timerID = null;                
                    node.status({fill:"blue",shape:"dot",text:"Initiating....."});
                    reconnect();                                                   
                }                        
            }       

        node.on("close", function () {                
                clearInterval(timerID);
                timerID = null;                    
                node.receiveEvent1 = null;
                node.receiveEvent2 = null;                  
                node.status({fill:"grey",shape:"dot",text:"Disconnected"});
        });
    }
    
    RED.nodes.registerType("modbustcp-read", ModbusTCPRead);

};
