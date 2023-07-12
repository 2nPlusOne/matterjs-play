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
    Matter.Vector.clampMagnitude = function(vector, maxMagnitude) {
        if (maxMagnitude < 0) {
            throw new Error("maxMagnitude must be greater than or equal to 0");
        }

        var magnitude = Matter.Vector.magnitude(vector);

        if (magnitude > maxMagnitude) {
            var multiplier = maxMagnitude / magnitude;
            return Matter.Vector.mult(vector, multiplier);
        } else {
            return Matter.Vector.clone(vector);
        }
    };
})(Matter);