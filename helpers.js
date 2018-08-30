let ieee = require('./ieee');


var helpers = {
    calcRate: function (rate, rateUnit) {
        let _rate;
        switch (rateUnit) {
            case "s":
                _rate = rate * 1000; //seconds
                break;
            case "m":
                _rate = rate * 60000; //minutes
                break;
            case "h":
                _rate = rate * 3600000; //hours
                break;
            case "ms":
            default:
                _rate = rate; //milliseconds
                break;
        }
        return _rate;
    },

    numfloat: function (nums, isBE) {
        // console.log('Got a numfloat', nums);
        var x = 0;
        var data = [];
        for (var i = 0; i < nums.length; i = i + 2) {
            var num = [];
            //currently setup for Big Endian (swap i and i+1 for Little Endian)
            var z = (isBE) ? i : i + 1;
            num[0] = nums[z] >> 8;
            num[1] = (nums[z] & 0x00FF);
            z = (isBE) ? i + 1 : i;
            num[2] = nums[z] >> 8;
            num[3] = (nums[z] & 0x00FF);
            data[x] = ieee.unpackF32(num.reverse());
            // console.log(data[x]);
            x++;
        }
        return data;

    },
    numdouble: function (nums, isBE) {
        //console.log('Got a numdouble:', isBE);
        var x = 0;
        var data = [];

        var offset = [];
        var z;

        if (isBE != true) {
            for (z = 3; z >= 0; z = z - 1) {
                offset.push(z);
            }
        }
        else {
            for (z = 0; z <= 3; z = z + 1) {
                offset.push(z);
            }
        }

        for (var i = 0; i < nums.length; i = i + 4) {
            var num = [];
            //currently setup for Big Endian (swap i and i+1 for Little Endian)
            num[0] = nums[i + offset[0]] >> 8;
            num[1] = (nums[i + offset[0]] & 0x00FF);
            num[2] = nums[i + offset[1]] >> 8;
            num[3] = (nums[i + offset[1]] & 0x00FF);
            num[4] = nums[i + offset[2]] >> 8;
            num[5] = (nums[i + offset[2]] & 0x00FF);
            num[6] = nums[i + offset[3]] >> 8;
            num[7] = (nums[i + offset[3]] & 0x00FF);
            data[x] = ieee.unpackF64(num.reverse());
            x++;
        }
        return data;
    },

    timestamp: function () {
        return new Date()
            .toISOString()
            .replace(/T/, " ") // replace T with a space
            .replace(/\..+/, "");
    },

    log: function (msg, args) {
        var ts = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
        if (args) console.log(ts + ": " + msg, args);
        else console.log( ts + ": " + msg);
    }.bind(this)

}

module.exports = helpers;


