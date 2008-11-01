// ASN.1 JavaScript decoder
// Copyright (c) 2008 Lapo Luchini <lapo@lapo.it>

// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// 
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

function Stream(enc, pos) {
    if (enc instanceof Stream) {
        this.enc = enc.enc;
        this.pos = enc.pos;
    } else {
        this.enc = enc;
        this.pos = pos;
    }
}
Stream.prototype.get = function() {
    if (this.pos >= this.enc.length)
	throw 'Requesting byte offset ' + this.pos + ' on a stream of length ' + this.enc.length;
    return this.enc[this.pos++];
}
Stream.prototype.hexDigits = "0123456789ABCDEF";
Stream.prototype.hexDump = function(start, end) {
    var s = "";
    for (var i = start; i < end; ++i)
	s += this.hexDigits.charAt(this.enc[i] >> 4) + this.hexDigits.charAt(this.enc[i] & 0xF) + " ";
    return s;
}
Stream.prototype.parseStringISO = function(start, end) {
    var s = "";
    for (var i = start; i < end; ++i)
	s += String.fromCharCode(this.enc[i]);
    return s;
}
Stream.prototype.parseStringUTF = function(start, end) {
    var s = "", c = 0;
    for (var i = start; i < end; ) {
	var c = this.enc[i++];
	if (c < 128) {
	    s += String.fromCharCode(c);
	    i++;
	} else if ((c > 191) && (c < 224)) {
	    c2 = this.enc[i++];
	    string += String.fromCharCode(((c & 0x1F) << 6) | (c2 & 0x3F));
	} else {
	    c2 = this.enc[i++];
	    c3 = this.enc[i++];
	    string += String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F));
	}
    }
    return s;
}
Stream.prototype.parseInteger = function(start, end) {
    if ((end - start) > 4)
	return undefined;
    //TODO support negative numbers
    var n = 0;
    for (var i = start; i < end; ++i)
	n = (n << 8) | this.enc[i];
    return n;
}
Stream.prototype.parseOID = function(start, end) {
    var s, n = 0, bits = 0;
    for (var i = start; i < end; ++i) {
	var v = this.enc[i];
	n = (n << 7) | (v & 0x7F);
	bits += 7;
	if (!(v & 0x80)) { // finished
	    if (s == undefined)
		s = parseInt(n / 40) + "." + (n % 40);
	    else
		s += "." + ((bits >= 31) ? "big" : n);
	    n = bits = 0;
	}
	s += String.fromCharCode();
    }
    return s;
}

function ASN1(stream, header, length, tag, sub) {
    this.stream = stream;
    this.header = header;
    this.length = length;
    this.tag = tag;
    this.sub = sub;
}
ASN1.prototype.typeName = function() {
    if (this.tag == undefined)
	return "unknown";
    var tagClass = this.tag >> 6;
    var tagConstructed = (this.tag >> 5) & 1;
    var tagNumber = this.tag & 0x1F;
    switch (tagClass) {
    case 0: // universal
	switch (tagNumber) {
	case 0x00: return "EOC";
	case 0x01: return "BOOLEAN";
	case 0x02: return "INTEGER";
	case 0x03: return "BIT_STRING";
	case 0x04: return "OCTET_STRING";
	case 0x05: return "NULL";
	case 0x06: return "OBJECT_IDENTIFIER";
	case 0x07: return "ObjectDescriptor";
	case 0x08: return "EXTERNAL";
	case 0x09: return "REAL";
	case 0x0A: return "ENUMERATED";
	case 0x0B: return "EMBEDDED_PDV";
	case 0x0C: return "UTF8String";
	case 0x10: return "SEQUENCE";
	case 0x11: return "SET";
	case 0x12: return "NumericString";
	case 0x13: return "PrintableString"; // ASCII subset
	case 0x14: return "TeletexString"; // aka T61String
	case 0x15: return "VideotexString";
	case 0x16: return "IA5String"; // ASCII
	case 0x17: return "UTCTime";
	case 0x18: return "GeneralizedTime";
	case 0x19: return "GraphicString";
	case 0x1A: return "VisibleString"; // ASCII subset
	case 0x1B: return "GeneralString";
	case 0x1C: return "UniversalString";
	case 0x1E: return "BMPString";
	default: return "Universal_" + tagNumber.toString(16);
	}
    case 1: return "Application_" + tagNumber.toString(16);
    case 2: return "[" + tagNumber + "]"; // Context
    case 3: return "Private_" + tagNumber.toString(16);
    }
}
ASN1.prototype.content = function() {
    if (this.tag == undefined)
	return null;
    var tagClass = this.tag >> 6;
    if (tagClass != 0) // universal
	return null;
    var tagNumber = this.tag & 0x1F;
    var content = this.posContent();
    var len = Math.abs(this.length);
    switch (tagNumber) {
    case 0x01: // BOOLEAN
	return (this.stream.enc[content] == 0) ? "false" : "true";
    case 0x02: // INTEGER
	return this.stream.parseInteger(content, content + len);
    //case 0x03: // BIT_STRING
    //case 0x04: // OCTET_STRING
    //case 0x05: // NULL
    case 0x06: // OBJECT_IDENTIFIER
	return this.stream.parseOID(content, content + len);
    //case 0x07: // ObjectDescriptor
    //case 0x08: // EXTERNAL
    //case 0x09: // REAL
    //case 0x0A: // ENUMERATED
    //case 0x0B: // EMBEDDED_PDV
    //case 0x10: // SEQUENCE
    //case 0x11: // SET
    case 0x0C: // UTF8String
	return this.stream.parseStringUTF(content, content + len);
    case 0x12: // NumericString
    case 0x13: // PrintableString
    case 0x14: // TeletexString
    case 0x15: // VideotexString
    case 0x16: // IA5String
    case 0x17: // UTCTime
    case 0x18: // GeneralizedTime
    //case 0x19: // GraphicString
    case 0x1A: // VisibleString
    //case 0x1B: // GeneralString
    //case 0x1C: // UniversalString
    //case 0x1E: // BMPString
	return this.stream.parseStringISO(content, content + len);
    }
    return null;
}
ASN1.prototype.toString = function() {
    return this.typeName() + "@" + this.stream.pos + "[header:" + this.header + ",length:" + this.length + ",sub:" + (this.sub == null ? 'null' : this.sub.length) + "]";
}
ASN1.prototype.print = function(indent) {
    if (indent == undefined) indent = '';
    document.writeln(indent + this);
    if (this.sub != null) {
        indent += '  ';
        for (var i = 0, max = this.sub.length; i < max; ++i)
            this.sub[i].print(indent);
    }
}
ASN1.prototype.toPrettyString = function(indent) {
    if (indent == undefined) indent = '';
    var s = indent + this.typeName() + " @" + this.stream.pos;
    if (this.length >= 0)
	s += "+";
    s += this.length;
    if (this.tag & 0x20)
	s += " (constructed)";
    else if (((this.tag == 0x03) || (this.tag == 0x04)) && (this.sub != null))
	s += " (encapsulates)";
    s += "\n";
    if (this.sub != null) {
        indent += '  ';
        for (var i = 0, max = this.sub.length; i < max; ++i)
            s += this.sub[i].toPrettyString(indent);
    }
    return s;
}
ASN1.prototype.toDOM = function() {
    var node = document.createElement("div");
    node.className = "node";
    node.asn1 = this;
    var content = this.content();
    if (content != null) {
	var s = String(content);
	if (s.length < 100)
	    node.title = s;
    }
    var head = document.createElement("div");
    head.className = "head";
    var s = this.typeName() + " @" + this.stream.pos + "+" + this.header;
    if (this.length >= 0)
	s += "+";
    s += this.length;
    if (this.tag & 0x20)
	s += " (constructed)";
    else if (((this.tag == 0x03) || (this.tag == 0x04)) && (this.sub != null))
	s += " (encapsulates)";
    s += "\n";
    head.innerHTML = s;
    node.appendChild(head);
    this.head = head;
    var sub = document.createElement("div");
    sub.className = "sub";
    if (this.sub != null) {
        for (var i = 0, max = this.sub.length; i < max; ++i)
            sub.appendChild(this.sub[i].toDOM());
    }
    node.appendChild(sub);
    head.switchNode = node;
    head.onclick = function() {
	var node = this.switchNode;
	node.className = (node.className == "node collapsed") ? "node" : "node collapsed";
    };
    return node;
}
ASN1.prototype.posStart = function() {
    return this.stream.pos;
}
ASN1.prototype.posContent = function() {
    return this.stream.pos + this.header;
}
ASN1.prototype.posEnd = function() {
    return this.stream.pos + this.header + Math.abs(this.length);
}
ASN1.prototype.toHexDOM = function() {
    var node = document.createElement("span");
    this.head.hexNode = node;
    this.head.onmouseover = function() { this.hexNode.className = 'hexCurrent'; }
    this.head.onmouseout  = function() { this.hexNode.className = ''; }
    var head = document.createElement("span");
    head.className = "head";
    head.appendChild(document.createTextNode(
	this.stream.hexDump(this.posStart(), this.posContent())));
    node.appendChild(head);
    if (this.sub == null)
	node.appendChild(document.createTextNode(
	    this.stream.hexDump(this.posContent(), this.posEnd())));
    else {
	function opt(className, stream, start, end) {
	    if (start >= end)
		return;
	    var sub = document.createElement("span");
	    sub.className = className;
	    sub.appendChild(document.createTextNode(
		stream.hexDump(start, end)));
	    node.appendChild(sub);
	};
	var first = this.sub[0];
	var last = this.sub[this.sub.length - 1];
	opt("intro", this.stream, this.posContent(), first.posStart());
	for (var i = 0, max = this.sub.length; i < max; ++i)
	    node.appendChild(this.sub[i].toHexDOM());
	opt("outro", this.stream, last.posEnd(), this.posEnd());
    }
    return node;
}
ASN1.decodeLength = function(stream) {
    var buf = stream.get();
    var len = buf & 0x7F;
    if (len == buf)
        return len;
    if (len > 3)
        throw "Length over 24 bits not supported at position " + (stream.pos - 1);
    if (len == 0)
	return -1; // undefined
    buf = 0;
    for (var i = 0; i < len; ++i)
        buf = (buf << 8) | stream.get();
    return buf;
}
ASN1.hasContent = function(tag, len, stream) {
    if (tag & 0x20) // constructed
	return true;
    if ((tag < 0x03) || (tag > 0x04))
	return false;
    var p = new Stream(stream);
    if (tag == 0x03) p.get(); // BitString unused bits, must be in [0, 7]
    var subTag = p.get();
    if ((subTag >> 6) & 0x01) // not (universal or context)
	return false;
    try {
	var subLength = ASN1.decodeLength(p);
	return ((p.pos - stream.pos) + subLength == len);
    } catch (exception) {
	return false;
    }
}
ASN1.decode = function(stream) {
    if (!(stream instanceof Stream))
        stream = new Stream(stream, 0);
    var streamStart = new Stream(stream);
    var tag = stream.get();
    var len = ASN1.decodeLength(stream);
    var header = stream.pos - streamStart.pos;
    var sub = null;
    if (ASN1.hasContent(tag, len, stream)) {
	var start = stream.pos;
	// it's constructed, so we have to decode content
	if (tag == 0x03) stream.get(); // BitString unused bits, must be in [0, 7]
        sub = [];
	if (len >= 0) {
	    // definite length
	    var end = start + len;
	    while (stream.pos < end)
		sub[sub.length] = ASN1.decode(stream);
	    if (stream.pos != end)
		throw "Content overflowed the constructed container";
	} else {
	    // undefined length
	    for (;;) {
		var s = ASN1.decode(stream);
		if (s.tag == 0)
		    break;
		sub[sub.length] = s;
	    }
	    len = start - stream.pos;
	}
    } else
        stream.pos += len; // skip content
    return new ASN1(streamStart, header, len, tag, sub);
}
ASN1.test = function() {
    var test = [
        { value: [0x27],                   expected: 0x27     },
        { value: [0x81, 0xC9],             expected: 0xC9     },
        { value: [0x83, 0xFE, 0xDC, 0xBA], expected: 0xFEDCBA },
    ];
    for (var i = 0, max = test.length; i < max; ++i) {
        var pos = 0;
        var stream = new Stream(test[i].value, 0);
        var res = ASN1.decodeLength(stream);
        if (res != test[i].expected)
            document.write("In test[" + i + "] expected " + test[i].expected + " got " + res + "\n");
    }
}
