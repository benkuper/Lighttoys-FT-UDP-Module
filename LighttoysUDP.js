var slaveCheckList = [];
var pairingMode = false;
var colors1 = [];
var colors2 = [];
var changed = [];

var alwaysUpdate = local.parameters.alwaysUpdate.get();
var lastUpdateTime = 0;

var updatingNames;

for(var i=0;i<32;i++) 
{
	colors1[i] = [0,0,0];
	colors2[i] = [0,0,0];
	changed = false;

	slaveCheckList[i] = false;
}

function init()
{
	detectRemote();
}


function update()
{	
	if(!pairingMode)
	{
		var time = util.getTime();

		if(time > lastCheckTime + 5) //check every 5 seconds
		{
			lastCheckTime = time;

			//send list request
			for(var i=0;i<32;i++) slaveCheckList[i] = false;
			sendMessage("glist");
			
		}

		if(alwaysUpdate) sendAllColors();
	}
}

function sendAllColors()
{
	var numPaired = local.values.connectedDevices.numPaired.get();
	var numConnected = local.values.connectedDevices.numConnected.get();

	for(var i=0;i<numPaired;i++)
	{
		if(!changed[i]) continue;

		//if(!slaveCheckList[i]) continue; //not connected
		var r1 = colors1[i][0];
		var g1 = colors1[i][1];
		var b1 = colors1[i][2];
		var r2 = colors2[i][0];
		var g2 = colors2[i][1];
		var b2 = colors2[i][2];

		var targetMask = 1 << i;
		sendMessage("leach "+targetMask+","+r1+","+g1+","+b1+","+r2+","+g2+","+b2);

		changed[i] = false;
	}
	
}

function moduleParameterChanged(param)
{
	if(param.name == "detectRemote")
	{
		detectRemote();
	}
	if(param.name == "pingAll")
	{
		ping("all",0,0,0);
	}else if(param.name == "blackOut")
	{
		blackOut("all",0,0,0);
	}else if(param.name == "addNewPairingGroup")
	{
		pairingMode = true;
		sendMessage("gadd 1");
		script.log("Start new pairing group");
	}else if(param.name == "addToGroup")
	{
		pairingMode = true;
		sendMessage("gadd 0");
		script.log("Pair new devices to the group");
	}else if(param.name == "finishPairing")
	{
		pairingMode = false;
		sendMessage("gstop");
		script.log("Finish pairing");
	}else if(param.name == "alwaysUpdate")
	{
		alwaysUpdate = local.parameters.alwaysUpdate.get();
	}else if(param.getParent().name == "deviceNames")
	{
		if(!updatingNames)
		{
			var propID = parseInt(param.name.substring(6, param.name.length));
			var propMask = getMaskForTarget("one",propID,0,0);
			script.log("Changing of Device "+propID+" to "+param.get());
			sendMessage("gname "+propMask+","+param.get());
		}
		
	}else if(param.name == "enableEcho")
	{
		sendMessage("mecho "+(local.parameters.enableEcho.get()?"1":"0"));
	}
}

//Events
function dataReceived(data)
{
	if(data.substring(0,6) == "wassup")
	{
		if(!local.parameters.remoteConnected.get())
		{
			local.parameters.output.remoteHost.set(data.substring(7, data.length));
			local.parameters.remoteConnected.set(true);
		}
	}

	if(data.substring(0,3) == "GRP")
	{
		var dataSplit = data.split(";");
		var pairingTarget = dataSplit[0].substring(6,dataSplit[0].length);

		if(pairingTarget == "master")
		{
			local.values.connectedDevices.numPaired.set(parseInt(dataSplit[2].substring(5, dataSplit[2].length)));
		}else if(pairingTarget == "slave") 
		{
			var propID = parseInt(dataSplit[1].substring(3,dataSplit[1].length));
			var isOn = dataSplit[7].substring(8,9) == "+";
			var voltageString = dataSplit[5];
			var voltage = parseInt(voltageString.substring(4,voltageString.length)) / 0x10000;
			slaveCheckList[propID] = isOn;
			local.values.connectedDevices.getChild("device"+propID).set(isOn?voltage:0);
			
			sendMessage("gname "+getMaskForTarget("one",propID,0,0));

			if(propID == local.values.connectedDevices.numPaired.get()-1)
			{
				var numConnected = 0;
				for(var i=0;i<32;i++) 
				{
					if(!slaveCheckList[i]) local.values.connectedDevices.getChild("device"+i).set(0);
					else numConnected++;
				}

				local.values.connectedDevices.numConnected.set(numConnected);
			}
		}
	}else if(data.substring(0,3) == "UDN")
	{
		updatingNames = true;
		var dataSplit = data.split(";");
		var propIDMask = parseInt(dataSplit[0].substring(7, dataSplit[0].length));
		var propName = dataSplit[1].substring(3, dataSplit[1].length);
		var propID = 0;
		while(propIDMask > 1)
		{
			propID++;
			propIDMask /= 2;
		} 
		local.parameters.deviceNames.getChild("device"+propID).set(propName);
		updatingNames = false;

	}
}

//Connection function
function detectRemote()
{
	local.parameters.remoteConnected.set(false);
	sendMessage("yo "+local.parameters.input.localPort.get());
	
	var ips = util.getIPs();
	for(var i=ips.length-1;i>=0;i--)
	{
		if(ips[i] == "127.0.0.1") continue;
		if(local.parameters.remoteConnected.get()) return;

		var b = ips[i].split(".");
		var broadcast = b[0]+"."+b[1]+"."+b[2]+".255";
		local.parameters.output.remoteHost.set(broadcast);
		sendMessage("yo "+local.parameters.input.localPort.get());
	}
	
}


//Commands callbacks
function ping(target, propID, startID, endID)
{
	var targetMask = getMaskForTarget(target, propID, startID, endID);
	sendMessage("lstop "+targetMask);
	sendMessage("gping "+targetMask);
}

function color(target, propID, startID, endID, mode, color1, color2)
{
	var targetMask = getMaskForTarget(target, propID, startID, endID);

	//Invert b and r because of inversion in the remote firmware 
	var r1 = parseInt(color1[2]*255);
	var g1 = parseInt(color1[1]*255);
	var b1 = parseInt(color1[0]*255);

	var r2=r1, g2=g1, b2=b1;

	if(mode == "ab")
	{
		r2 = parseInt(color2[2]*255);
		g2 = parseInt(color2[1]*255);
		b2 = parseInt(color2[0]*255);
	}else if(mode == "a")
	{
		//r1 = r2; g1 = g2; b1 = b2;
		r2 = -1; g2 = -1; b2 = -1;
	}else if(mode == "b")
	{
		r2 = r1; g2 = g1; b2 = b1;
		r1 = -1; g1 = -1; b1 = -1;
	}

	var col1 = [r1,g1,b1];
	var col2 = [r2,g2,b2];

	if(target == "one") 
	{
		if(mode != "b") colors1[propID] = col1;
		if(mode != "a") colors2[propID] = col2;
		changed[propID] = true;
	}
	else if(target == "range")
	{
		var minID = Math.min(startID, endID);
		var maxID = Math.max(startID, endID);
		for(var i=minID;i <= maxID;i++)
		{
			if(mode != "b") colors1[i] = col1;
			if(mode != "a") colors2[i] = col2;
			changed[i] = true;
		}
	}else if(target == "all") 
	{
		for(var i=0;i<32;i++)
		{
			if(mode != "b") colors1[i] = col1;
			if(mode != "a") colors2[i] = col2;
			changed[i] = true;
		}
	}

	if(!alwaysUpdate) 
	{
		sendMessage("leach "+targetMask+","+r1+","+g1+","+b1+","+r2+","+g2+","+b2);
	}
}

function startShow(target, propID, startID, endID, showID, delay, startTime)
{
	var targetMask = getMaskForTarget(target, propId, startID, endID);
	sendMessage("sstart "+targetMask+","+(showID-1)+", "+parseInt(delay*1000)+", "+parseInt(startTime*1000)); //this number is 2^32 - 1
}

function stopShow(target, propID, startID, endID)
{
	var targetMask = getMaskForTarget(target, propId, startID, endID);
	sendMessage("sstop "+targetMask);
}


function blackOut(target, propID, startID, endID)
{
	for(var i=0;i<31;i++) 
	{
		colors1[i] = [0,0,0];
		colors2[i] = colors1[i];
		changed[i] = true;
	}

	if(!alwaysUpdate)
	{
		var targetMask = getMaskForTarget(target, propId, startID, endID);
		sendMessage("leach "+targetMask+",0,0,0,0,0,0");
	}
	
}


//Advanced functions
function gradient(startID, endID, color1, color2)
{
	
	if(startID == endID) 
	{
		color("one",startID,0,0,color1);
		return;
	}

	//Invert b and r because of inversion in the remote firmware 
	var b1 = color1[0];
	var g1 = color1[1];
	var r1 = color1[2];

	var b2 = color2[0];
	var g2 = color2[1];
	var r2 = color2[2];

	var targetMask = 0;
	var minID = Math.min(startID, endID);
	var maxID = Math.max(startID, endID);

	for(var i=minID;i<=maxID;i++)
	{
		var p = (i-minID)*1.0/(maxID-minID);

		var r = parseInt((r1+(r2-r1)*p)*255);
		var g = parseInt((g1+(g2-g1)*p)*255);
		var b = parseInt((b1+(b2-b1)*p)*255);

		colors1[i] = [r,g,b];
		colors2[i] = colors1[i];
		changed[i] = true;

		if(!alwaysUpdate) 
		{
			targetMask = 1 << i;
			sendMessage("leach "+targetMask+","+r+","+g+","+b+","+r+","+g+","+b);
		}
	} 
	
}

function point(startID, endID, position, size, fade, color)
{
	var b = color[0];
	var g = color[1];
	var r = color[2];

	for(var i=startID;i<=endID;i++)
	{
		var p = (i-startID)*1.0/(endID-startID);

		if(Math.abs(position-p) < size) 
		{
			var fac = Math.min(Math.max(1-Math.abs((p-position)*fade*3/size),0),1);
			colors1[i] = [parseInt(r*fac*255), parseInt(g*fac*255), parseInt(b*fac*255)];

		}
		else colors1[i] = [0,0,0];

		colors2[i] = colors1[i];

		changed[i] = true;
	}

	
	if(!alwaysUpdate)
	{
		targetMask = 1 << i;
		sendMessage("leach "+targetMask+","+r+","+g+","+b+","+r+","+g+","+b);
	}
}

//Helpers
function getMaskForTarget(target, propID, startID, endID)
{
	if(target == "all") return 1099511627775;
	else if(target == "one") return 1 << propID;
	else if(target == "range") 
	{
		var targetMask = 0;
		var minID = Math.min(startID, endID);
		var maxID = Math.max(startID, endID);
		for(var i=minID;i<=maxID;i++) targetMask += (1 << i);
		return targetMask;
	}

	return 0;
}


function sendMessage(message)
{
	local.send(message+"\n");
}