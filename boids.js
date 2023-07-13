// import Matter.js library plugin
Matter.use("matter-wrap");

// Define 'Example' object if not already defined
var Example = Example || {};

Example.boids = function () {
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

  var USE_EDGE_WRAPPING = false; // set to false to disable wrapping
  var USE_MOUSE_AVOIDANCE = true; // set to true to avoid mouse pointer

  var BOIDS_COUNT = 350;
  var BOID_RADIUS = 4;
  var BOID_COLOR = "#ffffff";

  // experiment with these factors to find the best balance for your scenario
  // higher values mean the boids will attempt to match more strongly to the factor
  var FIELD_OF_VIEW = (3 * Math.PI) / 2; // 270 degrees in radians
  var VISUAL_RANGE = 80; // boids will attempt to match with neighbors within this range
  var PROTECTED_RANGE = 20; // boids will not attempt to match with neighbors within this range
  var CENTERING_FACTOR = 0.0008; // Cohesion - move toward center of neighbors
  var AVOID_FACTOR = .02; // Separation - avoid crowding neighbors (short range repulsion)
  var MATCHING_FACTOR = 0.02; // Alignment - match velocity with neighbors

  var MAX_SPEED = 5; // boids will not fly faster than this
  var MIN_SPEED = 4; // boids will not fly slower than this

  var EDGE_AVOIDANCE_FACTOR = 0.2; // dictates how quickly boids turn around at screen edges
  var MOUSE_AVOIDANCE_FACTOR = 0.003; // dictates how quickly boids steer away from mouse pointer

  var MOUSE_AVOIDANCE_RANGE = 200; // radius around mouse pointer that boids will avoid
  var WALL_AVOIDANCE_RANGE = 250; // radius around walls that boids will avoid
  
  var LEFT_MARGIN = WALL_AVOIDANCE_RANGE;
  var RIGHT_MARGIN = window.innerWidth - LEFT_MARGIN;
  var TOP_MARGIN = WALL_AVOIDANCE_RANGE;
  var BOTTOM_MARGIN = window.innerHeight - TOP_MARGIN;

  var engine = Engine.create();
  engine.gravity.y = 0;
  var render = Render.create({
    element: document.body,
    engine: engine,
    options: {
      width: window.innerWidth,
      height: window.innerHeight,
      wireframes: false,
    },
  });

  var runner = Runner.create();
  Runner.run(runner, engine);
  Render.run(render);

  var world = engine.world;

  var createBoid = function (x, y) {
    var boid = Bodies.circle(x, y, BOID_RADIUS, {
      frictionAir: 0.01,
      render: {
        fillStyle: BOID_COLOR,
      },
      plugin: {
        wrap: USE_EDGE_WRAPPING && {
          min: { x: 0, y: 0 },
          max: { x: window.innerWidth, y: window.innerHeight },
        },
      },
    });
    return boid;
  };

  // create boids
  for (var i = 0; i < BOIDS_COUNT; i++) {
    var x = Math.random() * window.innerWidth;
    var y = Math.random() * window.innerHeight;
    World.add(world, createBoid(x, y));
  }

  // apply a random starting velocity to all boids
  var boids = Composite.allBodies(world);
  for (let boid of boids) {
    Body.setVelocity(boid, Vector.mult(Vector.normalise({
      x: Math.random() > 0.5 ? Math.random() : -Math.random(),
      y: Math.random() > 0.5 ? Math.random() : -Math.random(),
    }), MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)));
  }

  // Function to get boids within the boid's visual perception
  // (visual range and angle) and outside its protected range.
  var getNeighbors = function (boid) {
    var neighbors = {};
    neighbors.neighborsToMatch = [];
    neighbors.neighborsToAvoid = [];

    var boids = Composite.allBodies(world);
    for (let otherBoid of boids) {
      if (boid === otherBoid) continue;

      var distance = Vector.magnitude(
        Vector.sub(boid.position, otherBoid.position)
      );

      if (distance > VISUAL_RANGE) continue;

      var angle = Vector.angle(
        boid.velocity,
        Vector.sub(otherBoid.position, boid.position)
      );
      if (angle < 0) angle = -angle;
      if (angle > FIELD_OF_VIEW / 2)continue;
      if (distance < PROTECTED_RANGE) {
        neighbors.neighborsToAvoid.push(otherBoid);
        continue;
      };
      neighbors.neighborsToMatch.push(otherBoid);
    }
    
    return neighbors;
  };

  // Function to get the cohesion accumulator vector.
  // Each boid steers gently toward the center of mass of
  // other boids within its visible range.
  var getCohesion = function (boid, neighborsToMatch) {
    var cohesion = { x: 0, y: 0 };
    var length = neighborsToMatch.length;
    if (length <= 0) return cohesion;
    for (let otherBoid of neighborsToMatch) {
      cohesion = Vector.add(cohesion, otherBoid.position);
    }
    if (length > 0) {
      cohesion = Vector.div(cohesion, length);
      cohesion = Vector.sub(cohesion, boid.position);
      cohesion = Vector.mult(cohesion, CENTERING_FACTOR);
    }
    return cohesion;
  };

  // Function to get the separation accumulator vector.
  // Each boid attempts to avoid running into other boids.
  // If two or more boids get too close to one another
  // (i.e. within one another's protected range), they will
  // steer away from one another.
  var getSeparation = function (boid, neighborsToAvoid) {
    var separation = { x: 0, y: 0 };
    if (neighborsToAvoid.length <= 0) return separation;
    for (let otherBoid of neighborsToAvoid) {
      let distanceVector = Vector.sub(boid.position, otherBoid.position)
      separation.x += distanceVector.x;
      separation.y += distanceVector.y;
    }
    separation = Vector.mult(separation, AVOID_FACTOR);
    return separation;
  };
  

  // Function to get the alignment accumulator vector.
  // Each boid attempts to match the velocity of other
  // boids inside its visible range.
  var getAlignment = function (boid, neighborsToMatch) {
    var alignment = { x: 0, y: 0 };
    var length = neighborsToMatch.length;
    if (length <= 0) return alignment;
    for (let otherBoid of neighborsToMatch) {
      alignment = Vector.add(alignment, otherBoid.velocity);
    }
    alignment = Vector.div(alignment, length);
    alignment = Vector.sub(alignment, boid.velocity);
    alignment = Vector.mult(alignment, MATCHING_FACTOR);
    return alignment;
  };

  // Function to get the accumulator for wall avoidance.
  // We want our boids to turn-around at an organic-looking
  // turn radius when they approach the screen margins.
  var getWallAvoidance = function (boid) {
    var wallAvoidance = { x: 0, y: 0 };
    if (boid.position.x < LEFT_MARGIN) {
      wallAvoidance.x += EDGE_AVOIDANCE_FACTOR;
    }
    if (boid.position.x > RIGHT_MARGIN) {
      wallAvoidance.x -= EDGE_AVOIDANCE_FACTOR;
    }
    if (boid.position.y > BOTTOM_MARGIN) {
      wallAvoidance.y -= EDGE_AVOIDANCE_FACTOR;
    }
    if (boid.position.y < TOP_MARGIN) {
      wallAvoidance.y += EDGE_AVOIDANCE_FACTOR;
    }
    return wallAvoidance;
  };

  // Function to get the accumulator for mouse avoidance.
  // We want our boids to steer away from the mouse pointer.
  var getMouseAvoidance = function (boid) {
    var mouseAvoidance = { x: 0, y: 0 };
    if (
      mouse.position.x > 0 &&
      mouse.position.x < window.innerWidth &&
      mouse.position.y > 0 &&
      mouse.position.y < window.innerHeight
    ) {
      var distance = Vector.magnitude(
        Vector.sub(boid.position, mouse.position)
      );
      if (distance < MOUSE_AVOIDANCE_RANGE) {
        mouseAvoidance = Vector.add(mouseAvoidance, Vector.sub(boid.position, mouse.position));
      }
    }
    mouseAvoidance = Vector.mult(mouseAvoidance, MOUSE_AVOIDANCE_FACTOR);
    return mouseAvoidance;
  };

  // Function to get all the accumulators for a boid.
  // We add up all the accumulators to get the boid's
  // steering vector.
  var getSteering = function (boid) {
    var neighbors = getNeighbors(boid);
    var cohesion = getCohesion(boid, neighbors.neighborsToMatch);
    var separation = getSeparation(boid, neighbors.neighborsToAvoid);
    var alignment = getAlignment(boid, neighbors.neighborsToMatch);

    var steering = { x: 0, y: 0 };
    steering = Vector.add(steering, cohesion);
    steering = Vector.add(steering, separation);
    steering = Vector.add(steering, alignment);

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
  // use Body.setVelocity
  var updateBoid = function (boid) {
    var steering = getSteering(boid);
    steering = Vector.add(steering, boid.velocity);
    Body.setVelocity(boid, steering); // Apply the new velocity
    limitSpeed(boid);
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
