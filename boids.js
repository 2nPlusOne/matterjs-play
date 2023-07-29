// import Matter.js library plugin
Matter.use("matter-wrap");

// Define 'Example' object if not already defined
var Example = Example || {};

Example.boids = function () {
  // Create aliases for required Matter.js components
  var Engine = Matter.Engine,
    Events = Matter.Events,
    Render = Matter.Render,
    Runner = Matter.Runner,
    World = Matter.World,
    Body = Matter.Body,
    Vector = Matter.Vector,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Mouse = Matter.Mouse,
    MouseConstraint = Matter.MouseConstraint;

  // Configuration variables
  // Toggle features
  var USE_EDGE_WRAPPING = false; // Toggle boid wrapping at edges. If false, boids will turn back at the edges.
  var USE_MOUSE_AVOIDANCE = true; // If true, boids will avoid mouse pointer.

  // Boid appearance and behavior
  var BOIDS_COUNT = 500; // The number of boids to simulate
  var BOID_RADIUS = 4; // The size of each boid
  var BOID_COLOR = "#ffffff"; // The color of each boid

  // Predator appearance and behavior
  var PREDATOR_COUNT = 0; // The number of predators to simulate
  var PREDATOR_RADIUS = 10; // The size of each predator
  var PREDATOR_COLOR = "#ff0000"; // The color of each predator
  var PREDATOR_SPEED = 5; // The speed of each predator
  var PREDATOR_SIGHT_RANGE = 100; // The distance at which predators can see boids
  var PREDATOR_EAT_RANGE = 2; // The distance at which predators can eat boids

  // Boid behavior adjustment factors
  var FIELD_OF_VIEW = (3 * Math.PI) / 2; // The boids' field of view. If another boid is outside this, it won't be considered a neighbor
  var VISUAL_RANGE = 60; // The distance at which boids will consider other boids as neighbors
  var PROTECTED_RANGE = 15; // The minimum distance a boid will try to maintain from its neighbors
  var CENTERING_FACTOR = 0.0008; // The strength of the urge to move towards the center of mass of neighbors (Cohesion)
  var AVOID_FACTOR = 0.02; // The strength of the urge to avoid close neighbors (Separation)
  var MATCHING_FACTOR = 0.01; // The strength of the urge to match velocity with neighbors (Alignment)

  // Boid speed limits
  var MAX_SPEED = 4; // The maximum speed a boid can achieve
  var MIN_SPEED = 4.5; // The minimum speed a boid can achieve

  // Edge and mouse avoidance
  var EDGE_AVOIDANCE_FACTOR = 0.2; // The strength of the urge to avoid the edge of the screen
  var MOUSE_AVOIDANCE_FACTOR = 0.003; // The strength of the urge to avoid the mouse pointer
  var MOUSE_AVOIDANCE_RANGE = 200; // The distance at which a boid will start to avoid the mouse pointer
  var WALL_AVOIDANCE_RANGE = 250; // The distance at which a boid will start to avoid the screen edge

  // Screen edge definitions
  var LEFT_MARGIN = WALL_AVOIDANCE_RANGE;
  var RIGHT_MARGIN = window.innerWidth - LEFT_MARGIN;
  var TOP_MARGIN = WALL_AVOIDANCE_RANGE;
  var BOTTOM_MARGIN = window.innerHeight - TOP_MARGIN;

  // Create the simulation engine and renderer
  var engine = Engine.create();
  engine.gravity.y = 0; // Set gravity to 0 for a 2D space
  var render = Render.create({
    element: document.body,
    engine: engine,
    options: {
      width: window.innerWidth,
      height: window.innerHeight,
      wireframes: false, // We'll render solid shapes, not wireframes
    },
  });
  var runner = Runner.create();
  Runner.run(runner, engine); // Start the simulation
  Render.run(render); // Start the renderer

  // Create the world that will contain the boids
  var world = engine.world;

  // Function to create a single boid at a given position
  var createBoid = function (x, y) {
    var boid = Bodies.circle(x, y, BOID_RADIUS, {
      frictionAir: 0.01, // Set air friction
      render: { fillStyle: BOID_COLOR }, // Set the rendering style
      plugin: {
        // Enable or disable wrapping at the screen edges
        wrap: USE_EDGE_WRAPPING && {
          min: { x: 0, y: 0 },
          max: { x: window.innerWidth, y: window.innerHeight },
        },
      },
    });

    return boid; // Return the created boid
  };

  // Create the initial flock of boids at random positions
  var boids = [];
  for (var i = 0; i < BOIDS_COUNT; i++) {
    var x = Math.random() * window.innerWidth;
    var y = Math.random() * window.innerHeight;
    boids.push(createBoid(x, y));
  }
  World.add(world, boids); // Add all the boids to the world

  // Apply initial random velocities to all the boids
  for (let boid of boids) {
    // Calculate velocity from random speed and direction
    var speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    var angle = Math.random() * 2 * Math.PI;
    Body.setVelocity(boid, {
      x: speed * Math.cos(angle),
      y: speed * Math.sin(angle),
    });
  }

  // Function to create a single predator at a given position
  var createPredator = function (x, y) {
    var predator = Bodies.circle(x, y, PREDATOR_RADIUS, {
      frictionAir: 0.01, // Set air friction
      render: { fillStyle: PREDATOR_COLOR }, // Set the rendering style
      plugin: {
        // Enable or disable wrapping at the screen edges
        wrap: USE_EDGE_WRAPPING && {
          min: { x: 0, y: 0 },
          max: { x: window.innerWidth, y: window.innerHeight },
        },
      },
    });

    return predator; // Return the created predator
  };

  // Create the initial flock of predators at random positions
  var predators = [];
  for (var i = 0; i < PREDATOR_COUNT; i++) {
    var x = Math.random() * window.innerWidth;
    var y = Math.random() * window.innerHeight;
    predators.push(createPredator(x, y));
  }
  World.add(world, predators); // Add all the predators to the world

  // Apply initial random velocities to all the predators
  for (let predator of predators) {
    // Calculate velocity from random speed and direction
    var speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    var angle = Math.random() * 2 * Math.PI;
    Body.setVelocity(predator, {
      x: speed * Math.cos(angle),
      y: speed * Math.sin(angle),
    });
  }

  // This function collects the neighbors of a given boid. A neighbor is considered
  // if it is within the boid's field of view and is in the visual range, but outside the protected range.
  var getNeighbors = function (boid) {
    var neighbors = {
      neighborsToMatch: [], // Neighbors that the boid will try to align and cohere with
      neighborsToAvoid: [], // Neighbors that are too close, and the boid will try to avoid
    };

    // Retrieve all boids in the world
    var boids = Composite.allBodies(world);

    for (let otherBoid of boids) {
      // Skip self-comparison
      if (boid === otherBoid) continue;

      var relativePosition = Vector.sub(otherBoid.position, boid.position);

      // Calculate distance to other boid
      var distanceToOther = Vector.magnitude(relativePosition);
      if (distanceToOther > VISUAL_RANGE) continue;

      // Compute angle between boid's velocity and vector pointing towards other boid
      // This provides the directional field of view
      var angle = Math.acos(
        Vector.dot(
          Vector.normalise(boid.velocity),
          Vector.normalise(relativePosition)
        )
      );

      // If other boid is outside of field of view, continue to next boid
      if (angle > FIELD_OF_VIEW / 2) continue;

      // If other boid is within protected range, add to neighbors to avoid
      if (distanceToOther < PROTECTED_RANGE) {
        neighbors.neighborsToAvoid.push(otherBoid);
        continue;
      }

      // If none of the above, add to neighbors to align and cohere with
      neighbors.neighborsToMatch.push(otherBoid);
    }

    return neighbors;
  };

  // This function computes the cohesion vector for a boid.
  // Cohesion is a behavior that guides a boid to move towards the center of mass of its neighbors.
  // This helps in forming a flock and maintaining its form.
  var getCohesion = function (boid, neighborsToMatch) {
    var cohesion = { x: 0, y: 0 }; // Initialize cohesion vector

    var length = neighborsToMatch.length;
    if (length <= 0) return cohesion;

    // Compute the center of mass of neighbors
    for (let otherBoid of neighborsToMatch) {
      cohesion = Vector.add(cohesion, otherBoid.position);
    }

    // If there are neighbors, compute the direction towards the center of mass from the boid's position
    // This is the cohesion vector, scaled by a centering factor to modulate the strength of the cohesion behavior
    if (length > 0) {
      cohesion = Vector.div(cohesion, length); // Average position (center of mass)
      cohesion = Vector.sub(cohesion, boid.position); // Direction towards the center of mass
      cohesion = Vector.mult(cohesion, CENTERING_FACTOR); // Scaling by centering factor
    }
    return cohesion;
  };

  // This function calculates the separation vector for a boid.
  // Separation is a behavior that prevents boids from colliding with each other.
  // When boids come within a certain range of each other, they attempt to steer away,
  // resulting in a separation behavior.
  var getSeparation = function (boid, neighborsToAvoid) {
    var separation = { x: 0, y: 0 };

    if (neighborsToAvoid.length <= 0) return separation;

    // Add all the vectors pointing from neighboring boids to the boid to the separation vector
    for (let otherBoid of neighborsToAvoid) {
      separation = Vector.add(
        separation,
        Vector.sub(boid.position, otherBoid.position)
      );
    }

    // Scale the separation vector by the avoidance factor to control the strength of the separation behavior
    separation = Vector.mult(separation, AVOID_FACTOR);

    return separation;
  };

  // This function calculates the alignment vector for a given boid.
  // Alignment is a behavior where a boid tries to align its velocity with the average
  // velocity of its neighboring boids in its visible range, thus simulating flock movement.
  var getAlignment = function (boid, neighborsToMatch) {
    var alignment = { x: 0, y: 0 }; // Initialize alignment vector

    // The number of neighbors to consider for alignment
    var neighborCount = neighborsToMatch.length;

    // If there are no neighboring boids, return the zero alignment vector
    if (neighborCount <= 0) return alignment;

    // Sum neighbors using reduce, then divide by the number of neighbors to get the average velocity
    for (let otherBoid of neighborsToMatch) {
      alignment = Vector.add(alignment, otherBoid.velocity);
    }
    alignment = Vector.div(alignment, neighborCount);

    // Subtract the boid's own velocity from the average velocity to get the alignment force
    alignment = Vector.sub(alignment, boid.velocity);
    // Multiply the alignment force by a factor to control the strength of the alignment behavior
    alignment = Vector.mult(alignment, MATCHING_FACTOR);

    return alignment; // Return the alignment vector
  };

  // This function calculates the wall avoidance vector for a boid.
  // This vector helps ensure boids do not wander off the screen
  // but instead, exhibit an organic-looking turn-around at the screen's edge.
  var getWallAvoidance = function (boid) {
    // Initialize the wall avoidance vector
    var wallAvoidance = { x: 0, y: 0 };

    // If a boid gets too close to the left edge, apply a force to push it to the right
    if (boid.position.x < LEFT_MARGIN) {
      wallAvoidance.x += EDGE_AVOIDANCE_FACTOR;
    }

    // If a boid gets too close to the right edge, apply a force to push it to the left
    if (boid.position.x > RIGHT_MARGIN) {
      wallAvoidance.x -= EDGE_AVOIDANCE_FACTOR;
    }

    // If a boid gets too close to the bottom edge, apply a force to push it upwards
    if (boid.position.y > BOTTOM_MARGIN) {
      wallAvoidance.y -= EDGE_AVOIDANCE_FACTOR;
    }

    // If a boid gets too close to the top edge, apply a force to push it downwards
    if (boid.position.y < TOP_MARGIN) {
      wallAvoidance.y += EDGE_AVOIDANCE_FACTOR;
    }

    return wallAvoidance;
  };

  // Function calculates a mouse avoidance vector for a given boid.
  // This influences the boid to move away from the mouse pointer when it's within the window and a certain range.
  var getMouseAvoidance = function (boid) {
    var mouseAvoidance = { x: 0, y: 0 };

    // Checks if the mouse pointer is within the window
    if (
      mouse.position.x > 0 &&
      mouse.position.x < window.innerWidth &&
      mouse.position.y > 0 &&
      mouse.position.y < window.innerHeight
    ) {
      var distance = Vector.magnitude(
        Vector.sub(boid.position, mouse.position)
      );

      // Generate a vector directing the boid away from the mouse
      // if within defined avoidance range
      if (distance < MOUSE_AVOIDANCE_RANGE) {
        mouseAvoidance = Vector.add(
          mouseAvoidance,
          Vector.sub(boid.position, mouse.position)
        );
      }
    }

    // Scale the avoidance vector by the defined factor
    mouseAvoidance = Vector.mult(mouseAvoidance, MOUSE_AVOIDANCE_FACTOR);

    return mouseAvoidance;
  };

  // This function calculates the total steering vector for a given boid. It combines
  // the influences of neighbor boids (cohesion, separation, alignment), as well as
  // factors such as wall avoidance and mouse avoidance, depending on the settings.
  var getSteering = function (boid) {
    var neighbors = getNeighbors(boid);

    // Calculate accumulators based on neighboring boids
    var cohesion = getCohesion(boid, neighbors.neighborsToMatch);
    var separation = getSeparation(boid, neighbors.neighborsToAvoid);
    var alignment = getAlignment(boid, neighbors.neighborsToMatch);

    var steering = { x: 0, y: 0 };

    // Add accumulators to the steering vector
    steering = Vector.add(steering, cohesion);
    steering = Vector.add(steering, separation);
    steering = Vector.add(steering, alignment);

    // Add wall avoidance and mouse avoidance vectors if enabled
    if (!USE_EDGE_WRAPPING) {
      var wallAvoidance = getWallAvoidance(boid);
      steering = Vector.add(steering, wallAvoidance);
    }
    if (USE_MOUSE_AVOIDANCE) {
      var mouseAvoidance = getMouseAvoidance(boid);
      steering = Vector.add(steering, mouseAvoidance);
    }

    return steering;
  };

  // Function to limit a boid's velocity to within the limits
  // defined by MIN_SPEED and MAX_SPEED.
  var limitSpeed = function (boid) {
    var speed = Vector.magnitude(boid.velocity);
    if (speed > MAX_SPEED) {
      Body.setVelocity(boid, Vector.mult(boid.velocity, MAX_SPEED / speed));
    } else if (speed < MIN_SPEED) {
      Body.setVelocity(boid, Vector.mult(boid.velocity, MIN_SPEED / speed));
    }
  };

  // Function to update a boid's velocity and position.
  var updateBoid = function (boid) {
    var MAX_STEERING_FORCE = 0.3; // Maximum steering force
    var steering = getSteering(boid); // Get the steering vector for the boid
    // Clamp the steering vector to the maximum steering force
    var steering = Vector.clampMagnitude(steering, MAX_STEERING_FORCE);

    // Linear Interpolation (LERP) factor.
    // This defines how fast the boid can change its velocity,
    // smaller values will result in smoother but slower turns.
    var LERP_FACTOR = 0.7;

    // Apply the new steering vector to the boid's velocity,
    // but instead of directly setting the velocity, we smoothly interpolate towards the new velocity
    var newVelocity = Vector.lerp(
      boid.velocity,
      Vector.add(steering, boid.velocity),
      LERP_FACTOR
    );
    // Limit the new velocity to within MIN_SPEED and MAX_SPEED
    newVelocity = Vector.clampMagnitude(newVelocity, MIN_SPEED, MAX_SPEED);

    Body.setVelocity(boid, newVelocity); // Apply the new velocity
    limitSpeed(boid); // Limit the boid's speed to within MIN_SPEED and MAX_SPEED
  };

  // Update all boids on each beforeUpdate event.
  Events.on(engine, "beforeUpdate", function (event) {
    for (let boid of boids) {
      updateBoid(boid);
    }
  });

  var mouse = Mouse.create(render.canvas);
  var mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: { visible: false },
    },
  });

  Composite.add(world, mouseConstraint);
  render.mouse = mouse;

  // render each boid's forward vector
  Events.on(render, "afterRender", function (event) {
    for (let boid of boids) {
      var position = boid.position;
      var velocity = boid.velocity;
      var forward = Vector.mult(velocity, 3);
      var head = Vector.add(position, forward);
      render.context.beginPath();
      render.context.strokeStyle = "white";
      render.context.lineWidth = 2;
      render.context.moveTo(position.x, position.y);
      render.context.lineTo(head.x, head.y);
      render.context.stroke();
    }
  });

  return {
    engine: engine,
    runner: runner,
    render: render,
    canvas: render.canvas,
    stop: function () {
      Render.stop(render);
      Runner.stop(runner);
    },
  };
};
