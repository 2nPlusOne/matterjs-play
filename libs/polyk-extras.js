/**
* A collection of useful additions to PolyK (https://polyk.ivank.net/)
*/

PolyK.Carve = function (p, lines) {
	if (lines.length < 2) return [p.slice(0)];

	var pgs = [];
	var ps = [];
	for (var i = 0; i < p.length; i += 2) ps.push(new PolyK._P(p[i], p[i + 1]));

	var allIscs = []; // array of arrays of intersections
	for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		var line = lines[lineIndex];
		var ax = line[0], ay = line[1], bx = line[2], by = line[3];

		var a = new PolyK._P(ax, ay);
		var b = new PolyK._P(bx, by);
		var iscs = []; // intersections for this line segment

		for (var i = 0; i < ps.length; i++) {
			var isc = new PolyK._P(0, 0);
			isc = PolyK._GetLineIntersection(a, b, ps[i], ps[(i + 1) % ps.length], isc);
			var fisc = iscs[0];
			var lisc = iscs[iscs.length - 1];
			if (isc && (fisc == null || PolyK._P.dist(isc, fisc) > 1e-10) && (lisc == null || PolyK._P.dist(isc, lisc) > 1e-10)) {
				isc.flag = true;
				iscs.push(isc);
				ps.splice(i + 1, 0, isc);
				i++;
			}
		}

		allIscs.push(iscs); // add this line's intersections to all intersections
	}

	for (var iscsIndex = 0; iscsIndex < allIscs.length; iscsIndex++) {
		var iscs = allIscs[iscsIndex];
		if (iscs.length < 2) continue;

		var comp = function (u, v) { return PolyK._P.dist(a, u) - PolyK._P.dist(a, v); }
		iscs.sort(comp);

		var dir = 0;
		while (iscs.length > 0) {
			var n = ps.length;
			var i0 = iscs[0];
			var i1 = iscs[1];
			var ind0 = ps.indexOf(i0);
			var ind1 = ps.indexOf(i1);
			var solved = false;

			if (PolyK._firstWithFlag(ps, ind0) == ind1) solved = true;
			else {
				i0 = iscs[1];
				i1 = iscs[0];
				ind0 = ps.indexOf(i0);
				ind1 = ps.indexOf(i1);
				if (PolyK._firstWithFlag(ps, ind0) == ind1) solved = true;
			}
			if (solved) {
				dir--;
				var pgn = PolyK._getPoints(ps, ind0, ind1);
				pgs.push(pgn);
				ps = PolyK._getPoints(ps, ind1, ind0);
				i0.flag = i1.flag = false;
				iscs.splice(0, 2);
				if (iscs.length == 0) pgs.push(ps);
			}
			else { dir++; iscs.reverse(); }
			if (dir > 1) break;
		}
	}

	var result = [];
	for (var i = 0; i < pgs.length; i++) {
		var pg = pgs[i];
		var npg = [];
		for (var j = 0; j < pg.length; j++) npg.push(pg[j].x, pg[j].y);
		result.push(npg);
	}

	return result;
}
