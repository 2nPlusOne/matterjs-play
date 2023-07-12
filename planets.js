// import Matter.js library plugin
Matter.use('matter-attractors');

// Define 'Example' object if not already defined
var Example = Example || {};

/**
 * This function creates a gravitational system simulation. The system consists
 * of randomly generated planets that attract each other based on their mass.
 * The planets will grow in mass (and size) when they collide.
 */
Example.planets = function () {
  // Define Matter.js modules
  var Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    World = Matter.World,
    Body = Matter.Body,
    Mouse = Matter.Mouse,
    Composite = Matter.Composite,
    MouseConstraint = Matter.MouseConstraint,
    Common = Matter.Common,
    Bodies = Matter.Bodies,
    Events = Matter.Events;

  // Define constants
  var G = 6.67408e-4;  // Gravitational constant (made stronger by 7 orders of magnitude)

  var SUN_MASS = 10000;
  var SUN_COLOR = '#ffaa00';
  var SUN_RADIUS = 50;

  var NUM_INITIAL_PLANETS = 3000;
  var STARTING_RADIUS_MIN_FACTOR = 0.1; // Adjust these factors as needed to achieve desired orbits
  var STARTING_RADIUS_MAX_FACTOR = 0.6; // Adjust these factors as needed to achieve desired orbits

  var NEW_PLANET_VELOCITY_FACTOR = .45; // Adjust this factor as needed to achieve desired orbits
  var NEW_PLANET_RANDOM_VELOCITY_FACTOR = .35; // higher values will result in more chaotic orbits
  var NEW_PLANET_MASS_MIN = .001;
  var NEW_PLANET_MASS_MAX = .05;
  var PLANET_RADIUS_SCALE_FACTOR = 6; // Adjust this factor as needed to achieve desired visual size (does not affect physics)

  var TRACER_MASS_THRESHOLD = 1.5;
  var TRACER_AGE = 5000; // ms
  var TRACER_LINE_WIDTH = 2; // px

  var MERGE_DELAY = 250; // ms
  var PLANET_MASS_MAX = 10;

  // Set a random seed for common module
  Common._seed = Math.random() * 10000;

  // Create an engine with zero gravity
  var engine = Engine.create();
  engine.gravity.scale = 0;

  // Store screen size for convenience
  var screen = { height: window.innerHeight, width: window.innerWidth };
  
  // Create a renderer
  var render = Render.create({
    element: document.body,
    engine: engine,
    options: {
      width: screen.width,
      height: screen.height,
      wireframes: false,
    },
  });
  
  // Create and run the runner
  var runner = Runner.create();
  Runner.run(runner, engine);
  Render.run(render);
  
  // Get reference to the world
  var world = engine.world;

  function gravity(bodyA, bodyB) {
    // use Newton's law of gravitation
    var bToA = Matter.Vector.sub(bodyB.position, bodyA.position),
      distanceSq = Matter.Vector.magnitudeSquared(bToA) || 0.0001,
      normal = Matter.Vector.normalise(bToA),
      magnitude = -G * (bodyA.mass * bodyB.mass / distanceSq),
      force = Matter.Vector.mult(normal, magnitude);

    // to apply forces to both bodies
    Matter.Body.applyForce(bodyA, bodyA.position, Matter.Vector.neg(force));
    Matter.Body.applyForce(bodyB, bodyB.position, force);
  }

  // Create a central sun object'
  var sun = Bodies.circle(screen.width / 2, screen.height / 2, SUN_RADIUS, {
    isStatic: true,
    mass: SUN_MASS,
    render: { fillStyle: SUN_COLOR },
    plugin: { attractors: [gravity] },
  });
  sun.tracer = { active: false, positions: [], maxPositions: 1000 };  // maxPositions limit to avoid memory overflow
  // Add the sun to the world
  World.add(world, sun);

  /**
   * This function creates a new planet with the given position and mass.
   * If no position or mass is provided, it will generate them randomly.
   */
  var createNewPlanet = function (position, mass, velocity) {
    var randomMass = mass || Common.random(NEW_PLANET_MASS_MIN, NEW_PLANET_MASS_MAX);
    var scaledRadius = Math.cbrt(randomMass) * PLANET_RADIUS_SCALE_FACTOR;

    // If position is not specified, place the planet at a random distance from the sun
    if (!position) {
      var distanceFromSun = Common.random(screen.width * STARTING_RADIUS_MIN_FACTOR, screen.width * STARTING_RADIUS_MAX_FACTOR);
      var angleFromSun = Common.random(0, 2 * Math.PI);
      position = {
        x: screen.width / 2 + distanceFromSun * Math.cos(angleFromSun),
        y: screen.height / 2 + distanceFromSun * Math.sin(angleFromSun)
      };
    }

    var body = Bodies.circle(
      position.x,
      position.y,
      scaledRadius,
      {
        mass: randomMass,
        frictionAir: 0,
        friction: 0,
        plugin: {
          attractors: [],
        },
      }
    );

    // If velocity is not specified, set it to a value that would result in a roughly circular orbit
    if (!velocity) {
      var distanceToSun = Math.sqrt(Math.pow(sun.position.x - position.x, 2) + Math.pow(sun.position.y - position.y, 2));
      var orbitVelocity = Math.sqrt(sun.mass / distanceToSun);
      // Increase the orbit velocity by some factor to compensate for the gravitational pull from other planets
      orbitVelocity *= NEW_PLANET_VELOCITY_FACTOR;  // Adjust this factor as needed
      
      // Add some randomness to the orbit velocity to make the orbits more interesting
      orbitVelocity *= Common.random(1 - NEW_PLANET_RANDOM_VELOCITY_FACTOR, 1 + NEW_PLANET_RANDOM_VELOCITY_FACTOR);

      // Calculate the angle between the planet and the sun      
      var angleToSun = Math.atan2(sun.position.y - position.y, sun.position.x - position.x);
      velocity = {
        x: -orbitVelocity * Math.sin(angleToSun),
        y: orbitVelocity * Math.cos(angleToSun)
      };
    }

    // Add the tracer property to the body
    body.tracer = { active: false, positions: [], maxPositions: 1000 };  // maxPositions limit to avoid memory overflow

    // Add the timestamp property to the body
    body.lastMerge = Date.now();

    Body.setVelocity(body, velocity);
    World.add(world, body);
    return body;
  };

  // Create random planets
  for (var i = 0; i < NUM_INITIAL_PLANETS; i += 1) {
    createNewPlanet();
  }

  /**
   * Event handler for the end of a collision. If the sun was involved, the other body is removed.
   * If two bodies collided, they are removed and a new body is created at the location of the first,
   * with a mass equal to the sum of the colliding bodies and a velocity based on the conservation of momentum.
   */
  Events.on(engine, 'collisionStart', function (event) {
    event.pairs.forEach(function (pair) {
      var bodyA = pair.bodyA;
      var bodyB = pair.bodyB;

      if (bodyA === sun) {
        // If bodyA is sun, remove bodyB and create a new planet
        World.remove(world, bodyB);
        createNewPlanet(null, bodyB.mass, null);
      } else if (bodyB === sun) {
        // If bodyB is sun, remove bodyA and create a new planet
        World.remove(world, bodyA);
        createNewPlanet(null, bodyA.mass, null);
      } else {
        // Check if enough time has passed since the last growth event
        var now = Date.now();
        if (now - bodyA.lastMerge < MERGE_DELAY && now - bodyB.lastMerge < MERGE_DELAY) {
          return; // Skip this pair if not enough time has passed
        }
        
        var combinedMass = bodyA.mass + bodyB.mass;

        // If neither of the bodies are the sun, create a new planet at their barycenter
        // with new mass and velocity based on the conservation of momentum
        var barycenter = {
          x: (bodyA.position.x * bodyA.mass + bodyB.position.x * bodyB.mass) / combinedMass,
          y: (bodyA.position.y * bodyA.mass + bodyB.position.y * bodyB.mass) / combinedMass
        };

        // If the combined mass exceeds the limit, set it to the limit
        if (combinedMass > PLANET_MASS_MAX) {
          combinedMass = PLANET_MASS_MAX;
        }

        // Calculate the velocity of the new body based on the conservation of momentum
        var newVelocity = {
          x: (bodyA.velocity.x * bodyA.mass + bodyB.velocity.x * bodyB.mass) / combinedMass,
          y: (bodyA.velocity.y * bodyA.mass + bodyB.velocity.y * bodyB.mass) / combinedMass
        };

        // choose the tracer of the larger body
        var tracer = bodyA.mass > bodyB.mass ? bodyA.tracer : bodyB.tracer;

        World.remove(world, bodyA);
        World.remove(world, bodyB);
        var newBody = createNewPlanet(barycenter, combinedMass, newVelocity);
        newBody.lastMerge = now;
        newBody.tracer = tracer;
      }
    });
  });

  function drawTracers(render) {
    let context = render.context;
    let now = Date.now();
    let ageLimitTimestamp = now - TRACER_AGE;

    let bodies = Composite.allBodies(world);
    
    context.lineWidth = TRACER_LINE_WIDTH;

    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      var positions = body.tracer.positions;
      var active = body.tracer.active;

      // Start tracing if mass threshold exceeded
      if (!active && body.mass > TRACER_MASS_THRESHOLD) {
        active = true;
      } 
      
      if (!active) continue;

      // Record new position
      positions.push({x: body.position.x, y: body.position.y, time: now});

      // Remove oldest positions if max positions exceeded
      while (positions.length > body.tracer.maxPositions) {
        positions.shift();
      }

      // Draw tracer
      context.strokeStyle = body.render.fillStyle;
      if (positions.length > 1) {
        for (var j = 1; j < positions.length; j++) {
          const alpha = Math.max(0, (Math.max(positions[j - 1].time, positions[j].time) - ageLimitTimestamp) / TRACER_AGE);
          context.globalAlpha = alpha;
          
          context.beginPath();
          context.moveTo(positions[j - 1].x, positions[j - 1].y);
          context.lineTo(positions[j].x, positions[j].y);
          context.stroke();
        }
      }

      // Reset globalAlpha to default
      context.globalAlpha = 1;
    }
  }

  // draw body tracers 
  Events.on(render, 'afterRender', function (event) {
    drawTracers(render);

    // console log the highest mass
    var bodies = Composite.allBodies(world);
  });


  // Create a mouse constraint to allow for planet dragging
  var mouse = Mouse.create(render.canvas);
  var mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.1,
      render: { visible: false },
    },
  });

  // Add mouseConstraint to the world
  Composite.add(world, mouseConstraint);
  render.mouse = mouse;

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
