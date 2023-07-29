/**
* A collection of useful additions to Matter.js (https://brm.io/matter-js/)
*/

(function(Matter) {

    // ****  Vector Extensions  ****
    /**
     * Clamps the magnitude of a vector to the given range. Magnitudes of 0 are returned as-is.
     * @method clampMagnitude
     * @param {vector} vector
     * @param {number} minMagnitude
     * @param {number} maxMagnitude
     * @return {vector} A new vector with its magnitude clamped
     */
    Matter.Vector.clampMagnitude = function(vector, minMagnitude = 0, maxMagnitude) {
        if (maxMagnitude < 0 || minMagnitude < 0) {
            throw new Error("minMagnitude and maxMagnitude must be greater than or equal to 0");
        }
    
        var magnitude = Matter.Vector.magnitude(vector);
    
        if (magnitude > maxMagnitude) {
            var multiplier = maxMagnitude / magnitude;
            return Matter.Vector.mult(vector, multiplier);
        } else if (magnitude < minMagnitude && magnitude !== 0) {
            var multiplier = minMagnitude / magnitude;
            return Matter.Vector.mult(vector, multiplier);
        } else {
            return Matter.Vector.clone(vector);
        }
    };

    /**
     * Linearly interpolates between two vectors.
     * @method lerp
     * @param {vector} a - The start vector
     * @param {vector} b - The end vector
     * @param {number} t - The interpolation factor between 0 and 1
     * @return {vector} A new vector that is t of the way between a and b
     */
    Matter.Vector.lerp = function(a, b, t) {
        return { 
            x: a.x + (b.x - a.x) * t, 
            y: a.y + (b.y - a.y) * t 
        };
    };

})(Matter);